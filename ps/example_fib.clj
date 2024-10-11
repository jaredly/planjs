; It's a lisp
;

(defn pcase [x p l a n] (PCASE p l a n x))
(defn ncase [x z p] (NCASE z p x))
(defn inc [x] (INC x))

(defn ! [v _] v)

; ncase*a
; inc*a
(defn + [a b]
    (ncase a b (fn [a] (inc (+ a b)))))

; pcase*1
(defn lcase [lst nil cons]
    (pcase lst
        (! nil)
        (! nil)
        cons
        (! nil)))

(def nil 0)

(defn zip [f one two]
    (lcase one
        nil
        (fn [a one]
            (lcase two
                nil
                (fn [b two]
                    ((f a b) (zip f one two)))))))

; should do ncase*n and pcase*n
(defn drop [n lst]
    (ncase n
        lst
        (fn [n]
            (lcase lst lst
                (fn [a rest] (drop n rest))))))

; should do ncase*n and pcase*n, and that's it?
(defn take [n lst]
    (ncase n nil (fn [n_]
        (lcase lst
            nil
            (fn [head tail] (head (take n_ tail)))))))

(defn fib [n]
    (let [self   (0 (1 (zip + self offset)))
          offset (drop 1 self)]
        (take n self)))

;(defn fib [_] (0 (1 (zipWith + (fib 0) (drop 1 (fib 0))))))
;(defn main [n] (take n (fib 0)))

(defn main [n] (fib n))

;(def lol (1 (2 (3 (4 $0)))))

;(defn main [x] (drop 2 lol))


