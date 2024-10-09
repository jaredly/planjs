# ps

it's a lisp for pallas

```clj
(defn some-name [a b c] (+ a (- b c)))

; primops are all caps
(INC 23)
(NCASE 98 (fn [_] 102) 0) ; 98
(NCASE 98 (fn [_] 102) 0) ; 102

```

## To try it out

```bash
pnpm install
bun ps/run.ts ps/example_fib.clj 15
```
output:
```
PIN 0: (def nil 0)
(0 (1 (1 (2 (3 (5 (8 (13 (21 (34 (55 (89 (144 (233 (377 nil)))))))))))))))
```
