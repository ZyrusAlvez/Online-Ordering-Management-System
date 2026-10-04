import express from 'express';
import { MAX_IMAGE_BYTES } from '../services/storage.service.js';

/**
 * Reads an image sent as the raw request body into req.body (a Buffer).
 * Any other Content-Type leaves req.body untouched, which storage.service
 * then rejects with a clear message.
 */
export const imageBody = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: MAX_IMAGE_BYTES,
});
