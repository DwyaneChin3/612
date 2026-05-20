const COS = require('cos-nodejs-sdk-v5');
const path = require('path');
const crypto = require('crypto');

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
});

const bucket = process.env.COS_BUCKET;
const region = process.env.COS_REGION;
const prefix = process.env.COS_PREFIX || 'uploads/';

function uploadBuffer(buffer, originalName, mimeType) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(originalName || '').toLowerCase() || mimeExt(mimeType);
    const key = `${prefix}${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: key,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
      },
      (err, data) => {
        if (err) return reject(err);
        const url = `https://${data.Location}`.replace(/^https:\/\/https:\/\//, 'https://');
        resolve({ url, key });
      }
    );
  });
}

function mimeExt(mime) {
  if (!mime) return '';
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('quicktime')) return '.mov';
  return '';
}

module.exports = { uploadBuffer };
