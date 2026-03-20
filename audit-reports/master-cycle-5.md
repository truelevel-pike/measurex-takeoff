# CYCLE 5 MASTER BUG LIST

Compiled from audits A5-A8 on 2026-03-20

## A5 AUDIT (src/app/api/ + src/lib/) - 74 BUGS FOUND
See audit-A5-cycle5.md for complete details

## A6 AUDIT (src/components/) - 37 BUGS FOUND (Cycle 5 full sweep)
See audit-A6-cycle5.md for complete details
- 0 CRITICAL, 7 HIGH, 18 MEDIUM, 12 LOW
- All files fully read; 17 prior cycle fixes verified
- Top priority: MeasurementTool coord space bug (BUG-A6-5-021), CustomFormulas double-conversion (BUG-A6-5-017), QuantitiesPanel N+1 merge loops (BUG-A6-5-029/030), xlsx CVE (BUG-A6-5-020)

## A7 AUDIT (src/store/ + src/hooks/ + drawing components) - CRITICAL FINDINGS  
See audit-A7-cycle5.md for complete details

## A8 AUDIT (pages + config + infra) - CRITICAL FINDINGS
See audit-A8-cycle5.md for complete details

**Total Bug Count: Estimated 150+ bugs across all sectors**

**Dispatching fix wave to all admirals now...**