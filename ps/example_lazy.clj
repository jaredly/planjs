
(defn main [_] (let [x 1 y 2] (x (y nil))))

(defn if [cond yes no]
    (ncase no (! yes) cond))

(defn main [_]
    (take 15
        (let [x (1 y)
              y (2 x)]
          x)))

(defn if [cond yes no]
    (ncase cond no (! yes)))

(defn main [n] (if 1 x (let [x 2] 3)))