
(def nil 0)
(defn ncase [n z p] (NCASE z p n))
(defn ! [v] (fn [_] v))

(defn main [_] (let [x 1 y 2] (x (y nil))))

(defn if [cond yes no]
    (ncase no (! yes) cond))

(defn if [cond yes no]
    (ncase cond no (! yes)))

(defn main [n] (if 1 x (let [x 2] 3)))

; ok but what about:

; so the classic tie the knot is:

(defn inf [x] (let [x (1 y)] (let [y (2 x)] y)))
; gives an infinite list of 1s and 2s

; GIVEN THAT the RHS of a let can access later-defined lets,
; WOULDNT IT FOLLOW that the follow would be technically valid?

(defn inf [x] (+ y (let [y (2 y)] y)))

; ugh so what does that mean.
; /sibling/ stack items should /not/ be able to reference each other,
; *unless* ... there's a let? hmmm. I think I need to visualize
; this stack.
;
; so the weirdness is this:
; when a /let/ returns, it can't necessarily pop the bound value
; off the stack.

; ok so
; semantically, plan has more than 4 forms, because of the law-dsl
