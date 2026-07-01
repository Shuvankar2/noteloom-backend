const { encrypt, decrypt } = require('../utils/crypto');
const assert = require('assert');

try {
  const original = 'my-super-secret-password-123';
  const encrypted = encrypt(original);
  console.log('Encrypted:', encrypted);
  assert.ok(encrypted.includes(':'), 'Encrypted text should match iv:authTag:encrypted format');
  
  const decrypted = decrypt(encrypted);
  console.log('Decrypted:', decrypted);
  assert.strictEqual(decrypted, original, 'Decrypted text should match original');
  
  // Test backward compatibility (passing plain text to decrypt should return it as-is)
  const plain = 'unencrypted-plain-text';
  const result = decrypt(plain);
  assert.strictEqual(result, plain, 'Plain text decryption should return original text');
  
  console.log('✅ Crypto tests passed successfully!');
} catch (error) {
  console.error('❌ Crypto tests failed:', error);
  process.exit(1);
}
