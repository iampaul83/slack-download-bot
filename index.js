require('dotenv').config()

const Koa = require('koa')
const Router = require('koa-router')
const bodyParser = require('koa-bodyparser')
const slack = require('./service/slack')
const debug = require('debug')('DownloadBot:index')

global.__basedir = __dirname

const app = new Koa()

const router = new Router()
const SLACK_VERIFICATION_TOKEN = process.env.SLACK_VERIFICATION_TOKEN

try {
  process.env.DOWNLOAD_DIR = process.env.DOWNLOAD_DIR ? process.env.DOWNLOAD_DIR : 'downloads'
  require('mkdirp').sync(process.env.DOWNLOAD_DIR)
} catch (error) {
  debug('unable to create directory at %s, error: %s', process.env.DOWNLOAD_DIR, error.message)
  throw error
}

router.post(
  '/slack/event',
  // slack token verify
  async (ctx, next) => {
    ctx.assert(ctx.input.token === SLACK_VERIFICATION_TOKEN, 404)
    next()
  },
  // challenge request
  async (ctx, next) => {
    if (ctx.input.type === 'url_verification') {
      ctx.body = ctx.input.challenge
      return
    }
    next()
  },
  async (ctx) => {
    debug('handle slack event')
    // response 200 OK
    ctx.body = null

    const event = ctx.input.event
    if (event.type === 'file_created') {
      debug('event is file_created')
      const fileInfo = await slack.fileInfo(event.file_id)
      slack.download(fileInfo)
      debug('file downloaded')
    } else if (event.type === 'file_change') {
      debug('event is file_change')
      const fileInfo = await slack.fileInfo(event.file_id)
      debug('fileInfo is %O', fileInfo)
    }
  }
)

app.use(bodyParser())
app.use((ctx, next) => {
  ctx.input = ctx.request.body
  next()
})

app.use(router.routes())
app.use(router.allowedMethods())

app.listen(process.env.PORT || 8080)

debug('server is listening on http://0.0.0.0:%s', process.env.PORT || 8080)
