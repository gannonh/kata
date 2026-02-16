// sample.js - Test fixture for scan-codebase.cjs JS extraction
// Known imports and exports for deterministic testing

import express, { Router, json } from 'express';
import { hashPassword } from './utils/hash';
import config from '../config';

const path = require('path');
const fs = require('fs');

// Dynamic import
const lazyModule = import('./lazy-module');

// This comment has a fake import that should NOT be extracted:
// import fakeModule from 'should-not-appear';

// URL with :// that should NOT be stripped as a comment
const API_URL = 'https://api.example.com/v1';

export const API_VERSION = '2.0';

export function createServer(port) {
  return express().listen(port);
}

export class AppRouter {
  constructor() {
    this.router = Router();
  }
}
