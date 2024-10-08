This was made from the pallas repo

```bash
for $name in sire/*;
  ./pallas save $name.seed $name
end
```

many of them failed because they didn't have a `main`, but this is what there was.
