; It's a lisp
;

(defn ! [v _] v)
(defn + [a b]
    (NCASE b (fn [a] (INC (+ a b))) a))
(defn lcase [lst nil cons]
    (PCASE
        (! nil)
        (! nil)
        cons
        (! nil))
        lst)
(defn zip [f one two]
    (lcase one
        0
        (fn [a one]
            (lcase two
                0
                (fn [b two]
                    ((f a b) (zip f one two)))))))
(defn drop [n lst]
    (ncase n
        lst
        (fn [n]
            (lcase lst lst
                (fn [a rest] (drop n rest))))))
(defn take [n lst]
    (ncase n 0 (fn [n_]
        (lcase lst
            0
            (fn [head tail] (head (take n_ tail)))))))
(defn fib [n]
    (let [self   (0 (1 (zip + self offset)))
          offset (drop 1 self)]
        (take n self)))
(defn main [n] (fib n))

;(def lol (1 (2 (3 (4 $0)))))

;(defn main [x] (drop 2 lol))


