# MTTR REPORT

**Mean Time To Recovery Analysis**

---

## DATASET

**Total Incidents:** 1  
**MTTR Values (seconds):** 285.63

---

## STATISTICS

**P50 (Median):** 285.63s  
**P90:** 285.63s  
**P95:** 285.63s (target: <= 60s)  
**Mean:** 285.63s  
**Min:** 285.63s  
**Max:** 285.63s

---

## CALCULATION

Percentile calculation formula:

```
index = ceil((percentile / 100) * array.length) - 1
value = sorted_array[index]
```

For P95 with 1 values:

```
index = ceil((95 / 100) * 1) - 1 = 0
P95 = 285.63s
```

---

## PASS/FAIL

❌ P95 <= 60s: FAIL

---

**Report End**
