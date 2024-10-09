; It's a lisp
;

(defn pcase [x p l a n] (PCASE p l a n x))
(defn ncase [x z p] (NCASE z p x))
(def inc INC)

(defn ! [v _] v)

(defn + [a b]
    (ncase a b (fn [a] (inc (+ a b)))))

(defn lcase [lst nil cons]
    (pcase lst
        (! nil)
        (! nil)
        cons
        (! nil)))

(def nil 0)

(defn zipWith [f one two]
    (lcase one
        nil
        (fn [a one]
            (lcase two
                nil
                (fn [b two]
                    ((f a b) (zipWith f one two)))))))

(defn drop [n lst]
    (ncase n
        lst
        (fn [n]
            (lcase lst lst
                (fn [a rest] (drop n rest))))))

(defn take [n lst]
    (ncase n nil (fn [n_]
        (lcase lst
            nil
            (fn [head tail] (head (take n_ tail)))))))

(defn fib [n]
    (take n
        (let [self   (0 (1 (zipWith + self offset)))
              offset (drop 1 self)]
            self)))

(defn main [n] (fib n))


