# Client fuzzy resolution notes

`indexer.py` now uses a blended scorer (`WRatio` + `token_set_ratio` for multi-word queries).

In `executor._resolve`, the existing thresholds remain valid:

| Constant | Value | Meaning |
|----------|-------|---------|
| MIN_ACCEPT_SCORE | 60 | Below → DeviceError "not found" |
| AUTO_ACCEPT_SCORE | 80 | Above + unique → auto-pick |
| NEAR_TIE_DELTA | 5 | Within 5 of best → Ambiguity for user pick |

Optional tightening (if you see too many wrong auto-picks):

```python
# in executor._resolve
if not hits or hits[0][1] < 65:          # was 60
    raise DeviceError(...)
if len(close) > 1 or best < 85:          # was 80
    raise Ambiguity(...)
```

No other client changes required – rapidfuzz was already a dependency.
