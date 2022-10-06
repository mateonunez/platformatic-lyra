'use strict'

const Fastify = require('fastify')
const mapper = require('@platformatic/sql-mapper')
const FastifyLyra = require('@mateonunez/fastify-lyra')
const resolveSchema = require('./lib/schema.js')
const connectionString = 'sqlite://./quotes.sqlite'
const LRU = require('lru-cache')

async function main () {
  const app = Fastify({
    logger: {
      level: 'info'
    }
  })

  const conn = await mapper.connect({ connectionString })
  const cache = new LRU({ max: 34000 })
  let ids = []

  app.ready(async () => {
    const quotes = await conn.entities.quote?.find()
    if (quotes?.length > 0) {
      for (const quote of quotes) {
        if (quote.id) {
          const { id } = quote 
          delete quote.id
          cache.set(id, quote)
        }
        await app.lyra.insert(quote)
      }
    }
    console.log('Quotes migrated to Lyra')
  })

  app.register(FastifyLyra, { schema: resolveSchema(conn.entities) })
  app.register(mapper.plugin, { connectionString })

  app.get('/quotes/lyra/:author', async function (req, reply) {
    const { author } = req.params

    let hits = []
    if (!ids.length || cache.get(author)) {
      const search = await app.lyra.search({
        term: author,
        exact: true,
        limit: 34000
      })
      hits = search.hits.map(hit => {
        ids.push(hit.id)
        return {
          quote: hit.quote,
          author: hit.author
        }
      })
    } else {
      const keys = [...cache.keys()]
      for (const key of keys) {
        hits.push(cache.get(key))
      }
    }

    return { count: hits.length, quotes: hits }
  })

  app.get('/quotes/mapper/:author', async function (req, reply) {
    const { author } = req.params
    const res = await app.platformatic.entities.quote.find({
      where: {
        author: {
          eq: author
        }
      }
    })
    return { count: res.length, quotes: res }
  })

  await app.listen({ port: 3333 })
}

main()
