;; So,
;; everything(?) is a VAL
;; except for ... my `list` type? idk maybe its a VAL too.
;; naw but it might be linked. we shall see. we'd cache the length for sure.
;; also it's add-only, so there's that going for us.

;; LOL ok I should definitely ... start with a minimal
;; impl that only knows about NAT and INC and APP.

;; then it's like ... how should I handle allocation?
;; because, refcounting has got to be a thing.
;; and at this point, and I writing my own language? as well?
;;
;; ideally this language would be expressive enough to
;; write a little allocator in
;; and be translatable to wasm with minimal fuss.
;;
;; it would probably be a lisp, because why not
;;
;; I don't need dynamic dispatch, which probably helps
;;
;; ok so another thing:
;; there are only 2 kinds of things.
;; VALS
;; lists of vals, that you can add to the end of.
;; I could keep these in two different ... pages?
;; hm probably not. better to keep things a little
;; more localized.

(module
    (memory $memory 1)

    (func $F (param $o i32) (return i32)
        (local.set $o (call $E (local.get $o)))
        (call $isApp (local.get $o))
        (if
            (then
                (call $F (call $appFn (local.get $o)))
                (call $setAppFn (local.get $o))
                (call $F (call $appArg (local.get $o))))
                (call $setAppArg (local.get $o))
            (else nop))
        (local.get $o))

    ;; I'm doing a mix of mutating and return a new thing
    ;; which is definitely going to end wellll
    (func $E (param $o i32) (return i32)

        (block
        (block
        (block
        (block
        (block
        (block
            (call $tag (local.get $o))
            (br_table 0 1 2 3 4)
        ) ;; 0: PIN
        (local.get $o)
        ) ;; 1: LAW
        (local.get $o)
        ) ;; 2: APP
        (local $fn i32)
        (call $appFn (local.get $o))
        (local.tee $fn)
        (local.set $o (call $E))
        (call $arity (local.get $fn))
        (i32.eq (i32.const 1))
        (if
            (then
                (call $appArgs (local.get $o))
                (call $X (local.get $o))
                )
            (else nop))
        (local.get $o)
        ) ;; 3: NAT
        (local.get $o)
        ) ;; 4: REF
        (call $refEnv (local.get $o))
        (i32.add (call $refIdx (local.get $o)))
        )
    )




)

