
; (def nil 0)
(defn pcase [x p l a n] (PCASE p l a n x))
(defn ncase [n z p] (NCASE z p n))
(defn ! [v _] v)
(defn lcase [lst nil cons]
    (let [end (! nil)]
    (pcase lst
        end
        end
        cons
        end)))

(defn inf [_] (let [x (100 y)] (let [y (200 x)] y)))
; (defn inf [x] (let [y (1 y)] y))

(defn take [n lst]
    (ncase n 0 (fn [n_]
        (lcase lst
            0
            (fn [head tail] (head (take n_ tail)))))))

(defn main [x] (take x (inf 6)))
;(defn main [x] (lcase 0 ))
