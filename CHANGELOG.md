# Changelog

## [0.0.3](https://github.com/AraneaDev/ariadne/compare/v0.0.2...v0.0.3) (2026-09-01)


### Documentation

* bring the readme in line with the other repos ([#3](https://github.com/AraneaDev/ariadne/issues/3)) ([0e62af1](https://github.com/AraneaDev/ariadne/commit/0e62af143f7d0a90d70dd9ffb68bc307389036b1))
* link MCP Observatory ([#4](https://github.com/AraneaDev/ariadne/issues/4)) ([5fa2f8f](https://github.com/AraneaDev/ariadne/commit/5fa2f8f423bfb92e1b114ffec34c3debeb406118))


### Continuous integration

* stop linting the generated changelog ([#1](https://github.com/AraneaDev/ariadne/issues/1)) ([220d6a8](https://github.com/AraneaDev/ariadne/commit/220d6a860da78a31cc65adeef1383b91349fb443))

## [0.0.2](https://github.com/AraneaDev/ariadne/compare/v0.0.1...v0.0.2) (2026-09-01)


### Features

* append-only ledger with per-session probe files ([eb85698](https://github.com/AraneaDev/ariadne/commit/eb85698469c067dba5e2e3a1c422f97825621881))
* backfill connection history from Claude Code's own logs ([e629928](https://github.com/AraneaDev/ariadne/commit/e629928ae3414a57a737fe07dacf23d23aa6f293))
* findings engine with a minimum-evidence floor per rule ([9e7cae3](https://github.com/AraneaDev/ariadne/commit/9e7cae34a5fef16c7cff7bdbb01c30ce2e888744))
* hook records call timing and sizes, and says nothing ([696023e](https://github.com/AraneaDev/ariadne/commit/696023ee9361f5f3eea54a60c50c104f17946304))
* ledger paths and project scaffold ([f70726a](https://github.com/AraneaDev/ariadne/commit/f70726a27b55822030d8617dc9140b046d8d84c6))
* measurement primitives and the privacy boundary ([f712628](https://github.com/AraneaDev/ariadne/commit/f7126283e978b979e7659df8859cbcdc17a19aa4))
* plugin manifest, hook binary build ladder ([7f70df7](https://github.com/AraneaDev/ariadne/commit/7f70df73b3839190b6f6932d73d0ba0ad28c00ee))
* report renderer and the ariadne CLI ([dcce8c6](https://github.com/AraneaDev/ariadne/commit/dcce8c6e558fdf7ccc3ec8f38f8708a642ec8570))
* roster parsing, spawn resolution and the probe run ([ced95a0](https://github.com/AraneaDev/ariadne/commit/ced95a07d16862ef6b3e10953e0e5d562a8d2355))
* stdio prober measures standing cost ([317a4a1](https://github.com/AraneaDev/ariadne/commit/317a4a183985e7674d1f677d6b05f2cdf1c30bde))


### Fixes

* address task 11 review round 1 ([dd064a4](https://github.com/AraneaDev/ariadne/commit/dd064a454bc7b819683e44cdde9fc9a829756772))
* close the error-code allowlist and fix the mcp tool name split ([b992a6a](https://github.com/AraneaDev/ariadne/commit/b992a6a93885e10901117ab6a4f5194c82f1bd46))
* correct percentiles, key consistency, tool-name matching, and drop the dead errors row ([a8c19f7](https://github.com/AraneaDev/ariadne/commit/a8c19f761fe58ecf683f03feaa79731684c9be73))
* correct what the prober measures and records ([c231dd7](https://github.com/AraneaDev/ariadne/commit/c231dd7378686a064eee30cdcaa80df8020f46f2))
* derive project from log cwd, validate transport, test defensive paths ([038481a](https://github.com/AraneaDev/ariadne/commit/038481af88943edc1e925e940c91bf42b7a162fc))
* drain stdin before every early exit to prevent broken pipe ([59bbb1e](https://github.com/AraneaDev/ariadne/commit/59bbb1e2ffea16e24abcb910d66ae44b3790a516))
* guard handle and errorClass against untrusted shapes ([88ea88c](https://github.com/AraneaDev/ariadne/commit/88ea88c5d2e0f29f40049bd21ffbc72b3187dde5))
* never persist ARIADNE_HOME, and resolve symlinks before hashing a project ([5df7430](https://github.com/AraneaDev/ariadne/commit/5df74302c01a603f9ca9fb79f4bdbed4112c0d73))
* recognise hyphenated transports and join sources by server identity ([197190e](https://github.com/AraneaDev/ariadne/commit/197190e61790c566f08cf2210dd7201017b5ee55))
* reconcile the no-output promise, and shim the hook binary for the first session ([eff83fc](https://github.com/AraneaDev/ariadne/commit/eff83fc71de20b0298ecc016da9acd9750f618ef))
* require watched traffic before calling a server never used ([c6444b2](https://github.com/AraneaDev/ariadne/commit/c6444b24021345626b72ad37a7575e25fbe20619))
* stop --session from silently filtering the report to nothing ([e8f8aa2](https://github.com/AraneaDev/ariadne/commit/e8f8aa23a31e316b797d00ddd16ef2ef76eb8301))
* task 2 review findings - improved test coverage and error resilience ([cc30402](https://github.com/AraneaDev/ariadne/commit/cc304025f70eaa62d5d0383337ec0c094ef123dd))


### Documentation

* add a contributing guide ([625335c](https://github.com/AraneaDev/ariadne/commit/625335cdb4278c4023f1de2f0a6bf7040fff8371))
* clarify that per-call tool failure rate is not measured ([5ae7c5a](https://github.com/AraneaDev/ariadne/commit/5ae7c5a2bdf2ecbfe791a4dbf64b4d8bdb848d85))
* give the README a badge header ([d70c00f](https://github.com/AraneaDev/ariadne/commit/d70c00fa17b7746bb38226460fb7ae24c506edc8))
* readme, honest limits and the /ariadne command ([2c2007b](https://github.com/AraneaDev/ariadne/commit/2c2007b4d768712843f9fb404e440fd513761ae0))
* reconcile the README with this fix wave ([969302a](https://github.com/AraneaDev/ariadne/commit/969302a40182e8d50fd56bff45990667e1e8c332))


### Tests

* add an end-to-end privacy test through the real ledger ([19a4bf8](https://github.com/AraneaDev/ariadne/commit/19a4bf83125987a740c57a40ded9e5b27f84b56d))


### Continuous integration

* add GitHub Actions workflow for lint, typecheck and test ([492a2e8](https://github.com/AraneaDev/ariadne/commit/492a2e806e7083a6ad058373c60bffb050b36d49))
* automate releases with release-please ([adcb0d6](https://github.com/AraneaDev/ariadne/commit/adcb0d675891fe63d96438368446ea90c01d1665))
* require conventional commit pull request titles ([b6f78eb](https://github.com/AraneaDev/ariadne/commit/b6f78ebb1ffb41d19e7407e443db1651e855b4cd))
