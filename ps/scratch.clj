
;;;;;;;;;;;;;

Simple:

(def main (INC 2))

(def main (INC (INC 2)))




;;;;;;;;

(defn ! [v _] v)

(defn lcase [lst nil cons]
    (PCASE
        (! nil)
        (! nil)
        cons
        (! nil)
        lst))
(defn zip [f one two]
    (lcase one
        0
        (fn [a one]
            (lcase two
                0
                (fn [b two]
                    ((f a b) (zip f one two)))))))
(defn drop [n lst]
    (NCASE
        lst
        (fn [n_]
            (lcase lst lst
                (fn [a rest] (drop n_ rest))))
        n))
(defn take [n lst]
    (NCASE 0 (fn [n_]
        (lcase lst
            0
            (fn [head tail] (head (take n_ tail)))))
        n))

(defn main [n] (powers 2 n))

(defn sum [lst] (lcase lst lst (fn [head tail] (+ head (sum tail)))))

(defn mul [a b]
   (let bees (b bees))
   (sum (take a bees)))

(defn map [f lst] (lcase lst (f lst) (fn [head tail] ((f head) (map f tail)))))

(defn powers [base n]
   (let self (base (map (fn [x] (mul x base)) self)))
   (take n self))

(defn fib [n]
    (let self (0 (1 (zip + self offset))))
    (let offset (drop 1 self))
    (take n self))



