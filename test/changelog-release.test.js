import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const BEFORE = `# Changelog

## [Unreleased]

### Added

- Something new.

## [1.0.0] - 2026-10-01

- First release.

[Unreleased]: https://github.com/prohand/gladys-withings/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/prohand/gladys-withings/releases/tag/v1.0.0
`;

test('the Unreleased section moves under the new version, links follow', () => {
  const after = rollChangelog(BEFORE, '1.1.0', '2026-10-14');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-10-14\n\n### Added\n\n- Something new\.\n/,
  );
  assert.match(
    after,
    /\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-withings\/compare\/v1\.1\.0\.\.\.HEAD/,
  );
  assert.match(
    after,
    /\[1\.1\.0\]: https:\/\/github\.com\/prohand\/gladys-withings\/compare\/v1\.0\.0\.\.\.v1\.1\.0/,
  );
});

test('an empty Unreleased section still names the release', () => {
  const empty = BEFORE.replace('### Added\n\n- Something new.\n\n', '');
  assert.match(
    rollChangelog(empty, '1.0.1', '2026-10-14'),
    /## \[1\.0\.1\] - 2026-10-14\n\n- Maintenance release/,
  );
});

test('a version already released is left untouched', () => {
  assert.equal(rollChangelog(BEFORE, '1.0.0', '2026-10-14'), BEFORE);
});
