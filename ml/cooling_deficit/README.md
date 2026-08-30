# Cooling-deficit experiment

This is a self-contained overnight analysis spike. It was created while the
daytime collector was active and therefore never imports, reads, or writes:

- `ml/data/raw/` or `ml/data/processed/`;
- the shared credit ledger or session timestamp file;
- `ml/src/collect/`, `ml/src/enrich/`, or the existing model export.

Its paid-response cache and all derived CSVs live under this folder's ignored
`data/` directory. The atomic lock is `runtime/collection.lock`; it only
serializes this package's collection process. Every paid command additionally
requires `--daytime-pipeline-idle`, an intentional human acknowledgement that
the separate daytime pipeline has stopped.

## What it implements

1. Phase 0 capability check for a chosen historical nighttime timestamp.
2. A 12-AOI spatially diverse panel, with one 22:00 LA evening and one 04:00
   LA predawn reading on the same local night.
3. Geometry-keyed cell matching, overnight cooling, and timestamp-specific AOI
   temperature anomalies.
4. City-wide, same-night, leave-one-out peer matching using NLCD fractional
   impervious surface, distance-to-coast and elevation. It begins at 10-point
   impervious/coast/elevation-tertile bins, then widens deterministically until
   a group has at least 15 cells. It never silently falls back to a global mean.
5. Cooling deficit and the four-quadrant daytime/overnight typology once a
   reviewed daytime-anomaly export is explicitly supplied.

SVF is intentionally not in the peer matching. It is also not built by this
spike; if unavailable for a later separate model, outputs should retain the
unmeasured-building-geometry caveat rather than claim causality.

## Safe execution sequence

From `C:\Fortyguard_batra\ml` with the Python 3.11 virtual environment active
(this package's own `data/` and `runtime/` have not yet been copied over from
the retired `D:\Fortyguard_batra` — check before assuming a fresh state here):

```powershell
# First run only once on Windows if the environment lacks IANA timezone data.
pip install -r cooling_deficit/requirements.txt

# Always dry-run first - costs nothing.
python -m cooling_deficit.capability_check --timestamp 2024-09-06T05:00:00Z

# Only after Claude's daytime collection is completely finished:
python -m cooling_deficit.capability_check --timestamp 2024-09-06T05:00:00Z --execute --daytime-pipeline-idle

# Select a confirmed usable historical night. `night-date` is the evening's
# LA-local date; predawn is automatically the following local calendar day.
python -m cooling_deficit.collect_overnight --night-date 2024-09-05 --dry-run
python -m cooling_deficit.collect_overnight --night-date 2024-09-05 --execute --daytime-pipeline-idle
```

The panel costs at most 48 requests (heatmap and `env_params` at two timestamps
for each of 12 AOIs), or 170,880 credits before cache hits. The specification's
“24 calls” counts timestamps; collecting both required endpoint types makes the
actual request count 48.

Once collected, compute the UTC stamps printed by the dry run and produce an
isolated cell-pair table:

```powershell
python -m cooling_deficit.extract_pairs --evening-stamp 20240906T0500Z --predawn-stamp 20240906T1100Z
```

Then copy (not link) reviewed enrichment values into a new
`cooling_deficit/data/derived/peer_features.csv` with:

```text
aoi,cell_id,nlcd_fractional_impervious_pct,distance_to_coast_m,elevation_m
```

Optionally copy daytime 1pm anomalies into a separate file:

```text
aoi,cell_id,day_peak_anomaly_c
```

```powershell
python -m cooling_deficit.compute_deficit --peer-features cooling_deficit/data/derived/peer_features.csv --daytime-anomalies cooling_deficit/data/derived/daytime_anomalies.csv
```

The final CSV keeps raw cooling, peer-group level/size, leave-one-out peer
mean, cooling deficit and typology. Positive `cooling_deficit_c` means a cell
cooled less than equivalent peers that night.
