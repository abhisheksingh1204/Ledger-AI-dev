const DEFAULT_DIMENSION = Number(process.env.EMBEDDING_DIMENSION || 96);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'local-hash-embedding-v1';

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function hashToken(token) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) {
    return vector.map(() => 0);
  }

  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function embedText(text, dimension = DEFAULT_DIMENSION) {
  const vector = Array.from({ length: dimension }, () => 0);
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const index = hashToken(token) % dimension;
    const weight = token.length > 6 ? 1.5 : 1;
    vector[index] += weight;
  }

  return normalizeVector(vector);
}

function cosineSimilarity(left, right) {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let i = 0; i < length; i += 1) {
    dot += left[i] * right[i];
    leftMagnitude += left[i] * left[i];
    rightMagnitude += right[i] * right[i];
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function vectorToJson(vector) {
  return vector.map((value) => Number(value.toFixed ? value.toFixed(8) : value));
}

function parseVector(value) {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item));
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => Number(item));
      }
    } catch (error) {
      return [];
    }
  }

  return [];
}

module.exports = {
  EMBEDDING_MODEL,
  DEFAULT_DIMENSION,
  cosineSimilarity,
  embedText,
  parseVector,
  tokenize,
  vectorToJson
};
