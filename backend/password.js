const crypto = require('crypto');
const { promisify } = require('util');
const scryptAsync = promisify(crypto.scrypt);

// Gera um hash no formato "scrypt$<salt>$<hash>", com salt aleatório por senha.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

// Compara a senha informada com o hash salvo, em tempo constante.
async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const derived = await scryptAsync(password, parts[1], 64);
  return crypto.timingSafeEqual(Buffer.from(parts[2], 'hex'), derived);
}

module.exports = { hashPassword, verifyPassword };
