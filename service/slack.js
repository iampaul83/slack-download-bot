const axios = require('axios')
const qs = require('qs')
const fs = require('fs')
const path = require('path')
const debug = require('debug')('DownloadBot:service:slack')
// const shortid = require('shortid')
// const contentDisposition = require('content-disposition')

const ACCESS_TOKEN = process.env.ACCESS_TOKEN
const BOT_TOKEN = process.env.BOT_TOKEN

const slackApiClient = axios.create({
  baseURL: 'https://slack.com/api/',
  timeout: 1000 * 30 // 30 sec
})

const slackDownloadClient = axios.create({
  timeout: 1000 * 30 // 30 sec
})

const form = (endpoint, data, { asBot } = {}) => {
  data.token = asBot ? BOT_TOKEN : ACCESS_TOKEN
  return slackApiClient.post(endpoint, qs.stringify(data))
}

// https://api.slack.com/methods/reactions.add
const reactionAdd = async (options) => {
  const response = await form('/reactions.add', options, { asBot: true })
  const data = response.data
  // file_not_found means bot is not in the channel
  if (!data.ok && data.error !== 'already_reacted' && data.error !== 'file_not_found') {
    debug('[reactionAdd] failed to add reaction, err = %s', data.error)
    throw new Error(data.error)
  }
}

const fileInfo = async (fileId) => {
  debug('[fileInfo] start /file.info request for %s', fileId)
  const response = await form('/files.info', { file: fileId })
  const data = response.data
  if (data.ok === false) {
    debug('[fileInfo] error for fileId = %s, err = %s', fileId, data.error)
    throw new Error(data.error)
  }
  return data.file
}

// file is https://api.slack.com/types/file
const download = async (file) => {
  // only download file from slack
  if (file.is_external) {
    debug('[download] file is external (%s)', file.external_type)
    debug('[download] external url is url_private = %s', file.url_private)
    // no url_private_download if file is external
    // debug('[download] external url is url_private_download = %s', file.url_private_download)
    return
  }

  // add name if name if null
  if (!file.name) {
    debug('[download] this file does not have name??')
    return
  }

  // not support `post` file
  if (file.mode === 'space') {
    debug('[download] no download post file')
    return
  }

  // handle no filename in snippet mode
  if (file.mode === 'snippet' && file.title === 'Untitled') {
    // -.js --->  snippet.js
    file.name = file.name.replace('-', 'snippet')
  }

  debug('[download] start download file from slack')

  const config = {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    responseType: 'stream'
  }
  // file.txt --> file__ID.txt
  const filename = file.name.replace(/(\.[^.]+)$/, `__${file.id}$1`)
  const response = await slackDownloadClient.get(file.url_private_download, config)

  // I use content-disposition to get file name before read `file` document ==> https://api.slack.com/types/file
  /*
  const disposition = contentDisposition.parse(response.headers['content-disposition'])
  const filename = `${disposition.parameters.filename}_${shortid.generate()}`
  */

  const inputStream = response.data
  const outputStream = fs.createWriteStream(path.join(global.__basedir, 'downloads', filename))
  inputStream.pipe(outputStream)
  await new Promise((resolve, reject) => {
    outputStream.on('finish', () => {
      resolve()
    })
  })

  // add reaction
  await reactionAdd({
    name: 'ok',
    file: file.id
  })
}

module.exports = {
  fileInfo,
  download
}
