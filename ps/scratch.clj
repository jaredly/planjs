
; (defn main [_] (take 10 (1 (2 (3 (4 nil))))))
; (defn main [_] (drop 2 (1 (2 (3 (4 nil))))))
; (defn main [_] (zipWith + (1 (2 (3 nil))) (5 (6 (7 0)))))
; (defn main [_] (+ 2 3))
; (defn main [_] (take 4 (inf 0)))
; (defn main [_] (ncase 0 nil (! 99)))
; (defn main [_] (lcase (98 (99 (100 0))) 23 (fn [head tail] head)) )

; (defn fib [_] (0 (1 (zipWith + (fib 0) (drop 1 (fib 0))))))
; (defn fib [_] (0 (1 (zipWith + $0 (drop 1 $0)))))
; (defn fibs [n] (take n (fib 0)))

; (defn main [_] ((inf 10) (take 5 (inf 10))))

; (defn main [_] (fibs 10))

;(defn main [_] (take 20 (let ($1 $2) $2)))

(defn inf [_] (0 (1 (2 $0))))