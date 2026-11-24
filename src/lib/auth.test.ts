import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canManageCategories,
  canManageUsersAndGitHub,
  canPublishArticles,
  computeGitHubPagesUrl,
  generateAccessKey,
  hashLoginKey,
  isGitHubOwnedDomain,
  isValidCustomDomain,
  sanitizeCustomDomain,
  validateLoginKey,
  validateUsername,
  verifyLoginKey,
} from './auth.ts';

test('hashLoginKey and verifyLoginKey validate matching keys with scrypt timingSafeEqual', () => {
  const { salt, keyHash } = hashLoginKey('alpha-wave-9921');
  assert.equal(verifyLoginKey('alpha-wave-9921', salt, keyHash), true);
  assert.equal(verifyLoginKey('wrong-key-0000', salt, keyHash), false);
  assert.equal(verifyLoginKey('', salt, keyHash), false);
});

test('validateUsername and validateLoginKey enforce safe bounds', () => {
  assert.equal(validateUsername('admin_1'), null);
  assert.notEqual(validateUsername('ab'), null);
  assert.notEqual(validateUsername('bad user!'), null);

  assert.equal(validateLoginKey('12345678'), null);
  assert.notEqual(validateLoginKey('short'), null);
});

test('generateAccessKey produces prefixed high-entropy keys', () => {
  const k1 = generateAccessKey();
  const k2 = generateAccessKey();
  assert.ok(k1.startsWith('amp_'));
  assert.ok(k1.length >= 24);
  assert.notEqual(k1, k2);
});

test('role permissions enforce admin, editor, and author boundaries', () => {
  assert.equal(canManageUsersAndGitHub('admin'), true);
  assert.equal(canManageUsersAndGitHub('editor'), false);
  assert.equal(canManageUsersAndGitHub('author'), false);

  assert.equal(canPublishArticles('admin'), true);
  assert.equal(canPublishArticles('editor'), true);
  assert.equal(canPublishArticles('author'), false);

  assert.equal(canManageCategories('editor'), true);
  assert.equal(canManageCategories('author'), false);
});

test('computeGitHubPagesUrl resolves user/org root repos, project repos, and custom domains', () => {
  assert.equal(
    computeGitHubPagesUrl('mostafa', 'mostafa.github.io'),
    'https://mostafa.github.io',
  );
  assert.equal(
    computeGitHubPagesUrl('mostafa', 'amplitudeland'),
    'https://mostafa.github.io/amplitudeland',
  );
  assert.equal(
    computeGitHubPagesUrl('mostafa', 'amplitudeland', 'https://blog.amplitudeland.org/'),
    'https://blog.amplitudeland.org',
  );
  assert.equal(
    computeGitHubPagesUrl('mostafa', 'amplitudeland', 'amplitudeland.github.io'),
    'https://mostafa.github.io/amplitudeland',
  );
  assert.equal(isGitHubOwnedDomain('amplitudeland.github.io'), true);
  assert.equal(isGitHubOwnedDomain('blog.amplitudeland.org'), false);
  assert.equal(sanitizeCustomDomain('http://localhost:3000'), '');
  assert.equal(isValidCustomDomain('amplitudeland.org'), true);
  assert.equal(isValidCustomDomain('not valid domain!'), false);
});
