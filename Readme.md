# PLAN but make it javascript

To run, I've been using `bun`.

```bash
pnpm install
# the tests
bun index.ts
# try running my lisp syntax
bun ps/run.ts ps/example_fib.clj
## and with an argument
bun ps/run.ts ps/example_fib.clj 15
# this is what it outpus:
# PIN 0: (def nil 0)
# (0 (1 (1 (2 (3 (5 (8 (13 (21 (34 (55 (89 (144 (233 (377 nil)))))))))))))))
```

