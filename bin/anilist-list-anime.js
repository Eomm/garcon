'use strict'

const assert = require('node:assert')
const readline = require('node:readline/promises')
const { parseArgs } = require('node:util')

const ANILIST_API_URL = 'https://graphql.anilist.co'

// The lists that mean "I know this series": their sequels are interesting.
// `PLANNING` and `DROPPED` are skipped on purpose: I don't care about their sequels (yet).
const KNOWN_STATUSES = ['CURRENT', 'COMPLETED', 'PAUSED', 'REPEATING']

// Opening/ending songs are registered as `MUSIC` anime and they are pure noise here
const IGNORED_FORMATS = ['MUSIC']

const VIEWER_QUERY = `
query {
  Viewer { id name }
}`

const MEDIA_LIST_QUERY = `
query ($userName: String, $type: MediaType) {
  MediaListCollection(userName: $userName, type: $type) {
    lists {
      name
      status
      entries {
        progress
        score
        media {
          id
          episodes
          siteUrl
          startDate { year month day }
          title { romaji english }
        }
      }
    }
  }
}`

const RELATIONS_QUERY = `
query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      title { romaji english }
      relations {
        edges {
          relationType
          node {
            id
            type
            status
            format
            episodes
            siteUrl
            startDate { year month day }
            title { romaji english }
          }
        }
      }
    }
  }
}`

const ADD_TO_PLANNING_MUTATION = `
mutation ($mediaId: Int) {
  SaveMediaListEntry(mediaId: $mediaId, status: PLANNING) {
    id
    status
    media { id siteUrl title { romaji english } }
  }
}`

/**
 * @param {string} query
 * @param {object} variables
 * @param {{ token?: string }} options
 */
async function anilistRequest (query, variables, options = {}) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
  }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`
  }

  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })

  // AniList is rate limited (~30 requests/minute): wait and retry once when throttled
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') ?? 60)
    console.log(`Rate limited by AniList, waiting ${retryAfter}s...`)
    await sleep(retryAfter * 1000)
    return anilistRequest(query, variables, options)
  }

  const body = await response.json()

  if (body.errors) {
    throw new Error(`AniList API error: ${body.errors.map(err => err.message).join(', ')}`)
  }

  return body.data
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function title (media) {
  return media.title.english || media.title.romaji
}

/**
 * Fetch the whole anime list of a public AniList user.
 *
 * @param {Options} options
 * @returns {Promise<AnimeList[]>}
 */
async function listAnime (options) {
  const data = await anilistRequest(
    MEDIA_LIST_QUERY,
    { userName: options.userName, type: 'ANIME' },
    options
  )

  return data.MediaListCollection.lists.map(list => ({
    name: list.name,
    status: list.status,
    entries: sortEntries(list, list.entries.map(entry => ({
      id: entry.media.id,
      title: title(entry.media),
      progress: `${entry.progress}/${entry.media.episodes ?? '?'}`,
      score: entry.score,
      release: formatDate(entry.media.startDate),
      link: entry.media.siteUrl,
      sortKey: dateSortKey(entry.media.startDate),
    }))),
  }))
}

/**
 * The `Planning` list is a huge backlog: the most recent releases are the ones I want to see first.
 * The other lists keep the order given by AniList.
 *
 * @param {{ status: string }} list
 * @param {object[]} entries
 */
function sortEntries (list, entries) {
  if (list.status !== 'PLANNING') {
    return entries
  }

  // The unknown release dates (`TBA`) first, then the newest ones
  return entries.sort((a, b) => b.sortKey - a.sortKey)
}

/**
 * Look for sequels of the series the user already knows and that are not in any of the user's lists.
 *
 * It walks the sequel chain: if `Dr. STONE S2` is unknown, its own sequels are inspected too,
 * so a series binge-added years ago still reports the latest season.
 *
 * @param {AnimeList[]} lists
 * @param {Options} options
 * @returns {Promise<Sequel[]>}
 */
async function findMissingSequels (lists, options) {
  const alreadyInList = new Set(lists.flatMap(list => list.entries.map(entry => entry.id)))
  const startingPoints = lists
    .filter(list => KNOWN_STATUSES.includes(list.status))
    .flatMap(list => list.entries)

  const found = new Map()
  const inspected = new Set()
  let toInspect = startingPoints.map(entry => ({ id: entry.id, from: entry.title }))
  let depth = 0

  while (toInspect.length > 0 && depth < options.depth) {
    depth++
    const nextRound = []

    for (const batch of chunk(toInspect.filter(item => !inspected.has(item.id)), 50)) {
      batch.forEach(item => inspected.add(item.id))

      const originOf = new Map(batch.map(item => [item.id, item.from]))
      const data = await anilistRequest(RELATIONS_QUERY, { ids: batch.map(item => item.id) }, options)

      for (const media of data.Page.media) {
        const sequels = media.relations.edges
          .filter(edge => edge.relationType === 'SEQUEL' &&
            edge.node.type === 'ANIME' &&
            !IGNORED_FORMATS.includes(edge.node.format))
          .map(edge => edge.node)

        for (const sequel of sequels) {
          if (alreadyInList.has(sequel.id) || found.has(sequel.id)) {
            continue
          }

          found.set(sequel.id, {
            id: sequel.id,
            title: title(sequel),
            // The series the sequel comes from, keeping the name of the entry in the user's list
            series: originOf.get(media.id) ?? title(media),
            status: sequel.status,
            state: sequel.status === 'NOT_YET_RELEASED' ? 'announced' : 'released',
            format: sequel.format,
            episodes: sequel.episodes ?? '?',
            releaseDate: formatDate(sequel.startDate),
            link: sequel.siteUrl,
          })

          // Follow the chain to catch the sequel of the sequel
          nextRound.push({ id: sequel.id, from: originOf.get(media.id) ?? title(media) })
        }
      }
    }

    toInspect = nextRound
  }

  return [...found.values()].sort((a, b) => {
    // Already out first, then the announced ones, both by series name
    if (a.state !== b.state) {
      return a.state === 'released' ? -1 : 1
    }
    return a.series.localeCompare(b.series)
  })
}

/**
 * @param {Sequel} sequel
 * @param {Options} options
 */
async function addToPlanning (sequel, options) {
  assert.ok(options.token, 'ANILIST_TOKEN is required to modify the AniList lists')
  const data = await anilistRequest(ADD_TO_PLANNING_MUTATION, { mediaId: sequel.id }, options)
  return data.SaveMediaListEntry
}

function displayAnimeList (lists) {
  for (const list of lists) {
    console.log(`\n# ${list.name} (${list.entries.length})`)
    console.table(list.entries.map(({ sortKey, ...entry }) => entry))
  }
}

function displaySequels (sequels) {
  console.log(`\n# New seasons of the series you follow (${sequels.length})`)
  console.table(sequels.map(sequel => ({
    series: sequel.series,
    season: sequel.title,
    state: sequel.state,
    format: sequel.format,
    episodes: sequel.episodes,
    release: sequel.releaseDate,
    link: sequel.link,
  })))
}

/**
 * Ask the user, one by one, which sequels must be added to the `Planning` list.
 *
 * @param {Sequel[]} sequels
 * @param {Options} options
 * @returns {Promise<Sequel[]>}
 */
async function askWhatToAdd (sequels, options) {
  if (options.yes) {
    return sequels
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const chosen = []

  try {
    for (const [index, sequel] of sequels.entries()) {
      const question = `[${index + 1}/${sequels.length}] ${sequel.series} → ${sequel.title} ` +
        `(${sequel.state}, ${sequel.releaseDate}) add to Planning? [y/N/a=all/q=quit] `
      const answer = (await rl.question(question)).trim().toLowerCase()

      if (answer === 'q') {
        break
      }
      if (answer === 'a') {
        chosen.push(...sequels.slice(index))
        break
      }
      if (answer === 'y') {
        chosen.push(sequel)
      }
    }
  } finally {
    rl.close()
  }

  return chosen
}

/**
 * @param {Options} options
 */
async function run (options) {
  const lists = await listAnime(options)

  if (!options.sequels) {
    displayAnimeList(lists)
    return
  }

  const sequels = await findMissingSequels(lists, options)

  if (sequels.length === 0) {
    console.log('No new season found: you are up to date 🎉')
    return
  }

  displaySequels(sequels)

  if (options.dryRun) {
    console.log('\nDry run: nothing added to the Planning list')
    return
  }

  if (!options.token) {
    console.log('\nSet ANILIST_TOKEN to add these seasons to your Planning list')
    return
  }

  const toAdd = await askWhatToAdd(sequels, options)

  for (const sequel of toAdd) {
    const entry = await addToPlanning(sequel, options)
    console.log(`Added to ${entry.status}: ${title(entry.media)} (${entry.media.siteUrl})`)
  }

  console.log(`\n${toAdd.length} season(s) added to the Planning list`)
}

function chunk (items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * A comparable number out of a partial AniList date: `2026-04` becomes `20260400`.
 * An unknown date is the furthest away in the future, so it sorts first.
 */
function dateSortKey ({ year, month, day } = {}) {
  if (!year) {
    return Number.MAX_SAFE_INTEGER
  }
  return (year * 10000) + ((month ?? 0) * 100) + (day ?? 0)
}

function formatDate ({ year, month, day } = {}) {
  if (!year) {
    return 'TBA'
  }
  return [year, month, day].filter(Boolean).map(part => String(part).padStart(2, '0')).join('-')
}

if (require.main === module) {
  const cliOptions = {
    user: { type: 'string', default: process.env.ANILIST_USER },
    sequels: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    depth: { type: 'string', default: '10' },
  }
  const { values } = parseArgs({ options: cliOptions })

  const options = {
    userName: values.user,
    token: process.env.ANILIST_TOKEN,
    sequels: values.sequels,
    yes: values.yes,
    dryRun: values['dry-run'],
    depth: Number(values.depth),
  }

  console.time('Done')
  resolveUserName(options)
    .then(run)
    .then(() => console.timeEnd('Done'))
    .catch(error => {
      console.error('Error:', error)
      process.exit(1)
    })
} else {
  module.exports = { listAnime, findMissingSequels, addToPlanning, displayAnimeList, displaySequels }
}

/**
 * When the token is set, the username can be read from AniList itself.
 *
 * @param {Options} options
 * @returns {Promise<Options>}
 */
async function resolveUserName (options) {
  if (options.userName) {
    return options
  }

  assert.ok(
    options.token,
    'The --user argument, the ANILIST_USER or the ANILIST_TOKEN env variable is required'
  )

  const data = await anilistRequest(VIEWER_QUERY, {}, options)
  console.log(`Authenticated as ${data.Viewer.name}`)
  return { ...options, userName: data.Viewer.name }
}

/**
 * @typedef {Object} Options
 * @property {string} userName
 * @property {string} [token]
 * @property {boolean} sequels
 * @property {boolean} yes
 * @property {boolean} dryRun
 * @property {number} depth How many times the sequel chain is followed
 */

/**
 * @typedef {Object} AnimeList
 * @property {string} name
 * @property {string} status
 * @property {Array<{ id: number, title: string, progress: string, score: number, link: string }>} entries
 */

/**
 * @typedef {Object} Sequel
 * @property {number} id
 * @property {string} title
 * @property {string} series
 * @property {string} status
 * @property {'released'|'announced'} state
 * @property {string} format
 * @property {number|string} episodes
 * @property {string} releaseDate
 * @property {string} link
 */
