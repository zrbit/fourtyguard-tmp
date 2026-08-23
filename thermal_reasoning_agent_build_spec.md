# Thermal Reasoning Agent — Prototype Build Specification

## 1. Product concept

Build a polished web application called **Thermal Reasoning Agent**.

The product answers:

> **Why is this block hotter or cooler than the blocks around it?**

The user selects a location/block on a US city map. The application gathers temperature and environmental/urban evidence, compares the selected location against nearby locations and historical conditions, and produces a ranked explanation.

This is NOT a generic weather dashboard.

Core loop:

**Detect → Investigate → Explain → Challenge → Recommend**

Example:

> This block is 4.8°F hotter than nearby blocks.
>
> Strongest evidence:
> 1. High impervious surface
> 2. Low tree canopy
> 3. Weak local wind
> 4. Urban geometry / low sky exposure
>
> Confidence: Moderate–High

The application must distinguish:
- measured facts
- derived/modelled evidence
- hypotheses
- uncertainty

Never present correlation as proven causation.

---

## 2. Primary UX

Default city: **Los Angeles**.

Optional cities:
- Chicago
- New York

Main flow:

1. User pans/zooms the thermal map.
2. User clicks a block/tile.
3. A right-side analysis panel opens.
4. Show:
   - temperature
   - anomaly vs nearby blocks
   - percentile/rank
   - confidence
5. User clicks **Investigate**.
6. Agent visibly investigates:
   - temperature comparison
   - neighborhood comparison
   - land-cover/surface characteristics
   - environmental conditions
   - urban geometry
   - historical persistence
7. Show a concise investigation timeline.
8. Show ranked explanations.
9. Expand a hypothesis to inspect evidence.
10. Allow follow-up questions in the context of the selected block.

Do NOT include gamification, points, badges, leaderboards, quests, or social features.

---

## 3. FortyGuard API — MUST READ OFFICIAL DOCS

Before implementation, Claude MUST read:

https://docs-api.fortyguard.com/docs/create-heatmap

Also inspect the linked official docs for:
- Quickstart
- Known Limitations
- Environmental Parameters
- Satellite Segmentation
- Street View Segmentation
- Heat Intelligence
- Status

Current documented capabilities include:

### Heatmap

POST:
`https://api.fortyguard.com/v1/heatmap`

Authentication:
`api-key: YOUR_API_KEY`

Flow:
1. POST request
2. receive `activity_id`
3. poll `GET https://api.fortyguard.com/v1/status/{activity_id}`
4. retrieve completed result

Heatmap supports:
- GeoJSON polygon AOI
- time/date configuration
- 60m / 80m / 100m granularity
- `tcm` temperature snapshots
- `time_of_measure`
- `exceedance`
- `persistence`

The result includes:
- `map_data` GeoJSON tiles
- `stats_data` aggregate statistics

Current documented US-only regional coverage must be respected.

Current documented heatmap area limits:
- Basic: up to 10 mi²
- Premium: up to 50 mi²

Do NOT hardcode undocumented behavior. Live official FortyGuard documentation is the source of truth.

### Environmental Parameters

`POST /v1/env_params`

Potential variables include:
- heat index
- apparent temperature
- relative humidity
- precipitation
- cloud cover
- wet bulb temperature
- AQI
- methane
- CO2
- solar irradiance / GHI / DNI / DHI

Use this to distinguish broader atmospheric conditions from local urban effects.

### Satellite Segmentation

`POST /v1/satellite`

Premium capability. Use where available for spatial/surface evidence.

### Street View Segmentation

`POST /v1/streetview`

Premium capability. Use where available for street-level evidence.

### Heat Intelligence

`POST /v1/heat_intelligence`

Analysis categories:
- geographic
- environmental
- urban
- events
- anthropogenic

Do NOT simply display FortyGuard's Heat Intelligence report as the reasoning agent. The point is to build an independent evidence/reasoning layer. It can be an additional evidence source or cross-check.

---

## 4. Architecture

```text
                    USER
                      |
                      v
              React / Next.js UI
                      |
                      v
              Application Backend
                      |
        +-------------+--------------+
        |             |              |
        v             v              v
  FortyGuard       Spatial        Historical
      API           Tools          Data
        |             |              |
        +-------------+--------------+
                      |
                      v
              Evidence Builder
                      |
                      v
             Statistical / ML Layer
                      |
                      v
                LLM Agent
                      |
          +-----------+-----------+
          |                       |
          v                       v
     Investigation            Final Answer
       Timeline              + Confidence
```

Do NOT send massive raw geospatial data to the LLM.

Convert raw data into compact structured evidence first.

---

## 5. Suggested stack

Frontend:
- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui or similarly polished primitives
- MapLibre GL JS or Mapbox GL JS
- Recharts or similar

Backend:
- Next.js API routes for prototype simplicity, OR FastAPI if Python is preferred for geospatial/ML work.

Data:
- PostgreSQL + PostGIS if persistence is required
- otherwise JSON/in-memory demo data
- GeoJSON for map layers

ML:
- Start with deterministic statistics
- optional XGBoost
- optional SHAP for model attribution

Do not train a deep model merely to make the project look "AI".

---

## 6. Reasoning agent tools

Suggested tools:

```text
get_temperature(location, timestamp)
compare_neighbors(location, timestamp)
get_environmental_conditions(location, timestamp)
get_land_cover(location)
get_building_characteristics(location)
get_surface_temperature(location, timestamp)
get_historical_temperature(location, comparable_period)
calculate_anomaly(location, timestamp)
get_spatial_context(location)
simulate_intervention(location, intervention)
```

The LLM should decide which evidence tools it needs.

For the prototype, tool results may be backed by deterministic mock data when API credentials are unavailable.

Clearly label:
- LIVE
- DEMO / MOCK
- MODELLED

Never fabricate live API results.

---

## 7. Reasoning workflow

When asked "Why is this block hot?":

### Step 1 — Establish anomaly

```text
target temperature
-
nearby comparable temperature
=
local temperature anomaly
```

Example:

```text
Target: 97.4°F
Neighbor average: 92.6°F
Anomaly: +4.8°F
```

### Step 2 — Check persistence

Compare historical observations for comparable times/conditions.

### Step 3 — Environmental context

Check:
- humidity
- wind speed/direction
- solar radiation
- cloud cover
- precipitation
- wet bulb / heat index where useful

### Step 4 — Surface characteristics

Check:
- impervious surface
- asphalt
- concrete
- vegetation
- tree canopy
- water
- parking
- exposed ground

### Step 5 — Urban form

Check:
- building density
- building height
- street width
- sky-view factor if available
- orientation
- urban-canyon characteristics

### Step 6 — Nearby controls

Ask:

> What is different about this block compared with nearby blocks experiencing the same broader weather?

### Step 7 — Generate hypotheses

Rank contributors.

Example:

```text
1. High impervious surface       HIGH
2. Low tree canopy               HIGH
3. Weak local ventilation        MEDIUM
4. Urban geometry                MEDIUM
5. Solar exposure                MEDIUM
```

### Step 8 — Critic pass

Have a second reasoning pass challenge the explanation:
- confounding variables
- contradictory evidence
- weak comparisons
- unsupported causal claims
- missing data

### Step 9 — Final explanation

Clearly separate:
- Observed
- Evidence
- Hypothesis
- Confidence
- Limitations

Do not expose private chain-of-thought. Show only concise investigation steps and evidence.

---

## 8. Example analysis

Target:

**Block 183, NYC**

```text
Temperature: 97.4°F
Nearby average: 92.6°F
Anomaly: +4.8°F

Impervious surface:
Target: 71%
Nearby: 44%

Tree canopy:
Target: 8%
Nearby: 24%

Wind:
Target: 2.1 mph
Nearby: 5.8 mph

Surface temperature:
Target: 129°F
Nearby: 112°F
```

Suggested answer:

> ### Why is this block hotter?
>
> The block is approximately 4.8°F hotter than nearby blocks.
>
> **1. High impervious surface — High confidence**
> The block has 71% impervious coverage versus 44% nearby.
>
> **2. Low tree canopy — High confidence**
> Tree canopy is 8% versus 24% nearby.
>
> **3. Weak local wind — Medium confidence**
> Wind is approximately 2.1 mph versus 5.8 mph nearby.
>
> **Conclusion**
> The combination of exposed urban surfaces, limited vegetation, and weaker ventilation provides the strongest evidence-based explanation.
>
> These are evidence-supported hypotheses, not a controlled causal experiment.

---

## 9. UI design

The design should feel like a **premium scientific instrument**, not a generic SaaS dashboard.

References in spirit:
- Google Maps
- Bloomberg Terminal
- modern climate visualization
- Apple-like information hierarchy
- scientific observatory

Avoid:
- generic AI purple
- excessive gradients
- giant AI labels
- too many rounded cards
- dashboard clutter
- 20-widget layouts

The map is the hero.

### Desktop layout

```text
+--------------------------------------------------------------+
| THERMAL                 Search location       status         |
+--------------------------------------------------------------+
|                                                              |
|                         MAP                                  |
|                                                              |
|                thermal tiles / blocks                        |
|                                                              |
|                                      +---------------------+ |
|                                      | BLOCK ANALYSIS      | |
|                                      |                     | |
|                                      | 97.4°F              | |
|                                      | +4.8°F vs nearby    | |
|                                      |                     | |
|                                      | [Investigate]       | |
|                                      |                     | |
|                                      | WHY IT'S HOT       | |
|                                      |                     | |
|                                      | High                | |
|                                      | Impervious surface  | |
|                                      |                     | |
|                                      | High                | |
|                                      | Low tree canopy     | |
|                                      |                     | |
|                                      | Medium              | |
|                                      | Weak ventilation    | |
|                                      +---------------------+ |
|                                                              |
+--------------------------------------------------------------+
```

Mobile:
- map on top
- bottom sheet for analysis
- full-screen sheet for investigation

---

## 10. Analysis panel

Selected block:

```text
BLOCK 183
Manhattan, New York

97.4°F

+4.8°F
vs nearby blocks
```

Show:
- temperature distribution
- target marker
- nearby distribution

Then:

### What makes this unusual?

Ranked factors:

```text
🔥 Impervious surface
HIGH CONTRIBUTION
71% vs 44% nearby

🌳 Low tree canopy
HIGH CONTRIBUTION
8% vs 24% nearby

🌬 Weak ventilation
MEDIUM CONTRIBUTION
2.1 vs 5.8 mph
```

Each factor should expand into evidence.

---

## 11. Evidence card

Example:

### Impervious surface

Target:
71%

Nearby:
44%

Difference:
+27 percentage points

Why it matters:
Impervious urban surfaces can absorb and retain solar heat.

Evidence strength:
High

Source:
Satellite / land-cover analysis

---

## 12. Investigation timeline

Show a user-facing activity timeline:

```text
✓ Establishing temperature anomaly
✓ Comparing 12 nearby blocks
✓ Checking vegetation and surface coverage
✓ Checking atmospheric conditions
✓ Examining urban geometry
✓ Testing alternative explanations
✓ Ranking contributing factors
```

Do NOT expose hidden chain-of-thought.

---

## 13. Compare mode

Allow users to select two blocks.

Example:

```text
                 BLOCK A       BLOCK B

Temperature       97.4°F        92.6°F
Tree canopy         8%           24%
Impervious         71%           44%
Wind               2.1 mph       5.8 mph
Surface temp       129°F         112°F
```

Then:

> **Why does A differ from B?**

This comparison should be a core feature.

---

## 14. Agent chat

Include a compact contextual chat:

> Ask about this block...

Examples:
- Why is this hotter than the block north of it?
- Is this a persistent hotspot?
- What is the strongest evidence?
- What is uncertain?
- What could cool it?

The chat remains tied to the selected location.

---

## 15. Optional intervention mode

Only after the core reasoning works.

Button:

**What could cool this block?**

Possible interventions:
- tree canopy
- cool roof
- reflective pavement
- shade structures
- vegetation
- green roof

Clearly label output as simulated/modelled, not measured.

---

## 16. Demo mode

The prototype MUST work without an API key.

Create deterministic demo data for 10–20 NYC/Chicago/LA-style blocks with:
- temperature
- nearby average
- tree canopy
- impervious surface
- building density
- wind
- surface temperature
- historical anomaly

Mark it clearly:

**DEMO DATA**

Do not imply synthetic data is live measured data.

---

## 17. Live FortyGuard mode

Use:

```text
FORTYGUARD_API_KEY=
```

Server-side only.

Never expose the API key in browser JavaScript.

Implement:
- POST submission
- activity ID
- bounded polling
- Completed / Failed states
- timeout handling
- 400 / 401 / 403 / 404 / 429 / 500 handling
- caching where appropriate

Never log API keys or temporary signed URLs.

---

## 18. API abstraction

Create:

```text
lib/fortyguard/
  client.ts
  heatmap.ts
  envParams.ts
  satellite.ts
  streetview.ts
  heatIntelligence.ts
  status.ts
```

UI components must not directly call FortyGuard.

UI should call application-level functions such as:

```text
analyzeLocation()
getHeatmap()
getEnvironmentalContext()
```

---

## 19. Data model

```typescript
type Evidence = {
  id: string;
  category:
    | "temperature"
    | "vegetation"
    | "surface"
    | "weather"
    | "urban_form"
    | "history";

  metric: string;
  targetValue: number | string;
  comparisonValue?: number | string;
  difference?: number;
  unit?: string;

  source: string;
  strength: "low" | "medium" | "high";

  explanation: string;
};

type Hypothesis = {
  title: string;
  confidence: "low" | "medium" | "high";
  evidenceIds: string[];
  explanation: string;
  counterEvidence?: string[];
};

type ThermalAnalysis = {
  temperature: number;
  anomaly: number;
  hypotheses: Hypothesis[];
  evidence: Evidence[];
  limitations: string[];
};
```

---

## 20. Agent system prompt

```text
You are an urban thermal reasoning agent.

Your job is to investigate why a selected location is hotter or cooler than comparable nearby locations.

Rules:

1. Establish the observed temperature anomaly first.
2. Compare the target location against nearby controls.
3. Gather evidence from multiple categories rather than relying on one variable.
4. Distinguish measured facts from derived statistics and hypotheses.
5. Never claim correlation is proof of causation.
6. Consider contradictory evidence.
7. Rank hypotheses by evidence strength.
8. State uncertainty explicitly.
9. Prefer concise quantitative explanations.
10. Never invent unavailable measurements.
11. If evidence is insufficient, say so.
12. For intervention simulations, clearly label results as model estimates.
```

---

## 21. Critic prompt

```text
You are a skeptical scientific reviewer.

Review the proposed explanation for a local temperature anomaly.

Look for:
- confounding variables
- weak comparisons
- unsupported causal claims
- contradictory neighboring observations
- insufficient historical evidence
- overconfidence

Return:
1. strongest supported hypothesis
2. weakest hypothesis
3. missing evidence
4. revised confidence
```

Only show the resulting concise critique, not hidden reasoning.

---

## 22. Suggested project structure

```text
app/
  page.tsx
  api/
    heatmap/
    analyze/
    status/
    environment/

components/
  map/
  analysis/
  evidence/
  agent/
  charts/
  ui/

lib/
  fortyguard/
  reasoning/
  spatial/
  mock-data/
  models/

types/
  thermal.ts
  evidence.ts
  agent.ts

public/
  demo/
```

---

## 23. Build order

### Phase 1
Polished static UI with demo data.

### Phase 2
Interactive map + block selection.

### Phase 3
Analysis panel.

### Phase 4
Evidence model + deterministic reasoning.

### Phase 5
Agent tool loop.

### Phase 6
FortyGuard integration.

### Phase 7
Historical comparison.

### Phase 8
Optional XGBoost/SHAP attribution.

### Phase 9
Optional intervention simulation.

### Phase 10
Polish, responsive behavior, error states and demo flow.

Do NOT begin by wiring every API endpoint.

Get:

**Click block → Investigate → Explain why**

working first.

---

## 24. Winning demo

Target a 2–3 minute demo.

1. Show NYC thermal map.
2. Explain that city-wide heat hides block-level differences.
3. Select two adjacent blocks.
4. Show the temperature difference.
5. Click **Investigate**.
6. Show the evidence gathering.
7. Show ranked hypotheses.
8. Expand a hypothesis to see quantitative evidence.
9. Ask a follow-up question.
10. Optionally simulate a cooling intervention.

Final message:

> **We don't just tell a city where it is hot. We give it an evidence-based explanation of why.**

---

## 25. Design / development tooling

Recommended workflow:

### Figma
Use Figma to establish:
- visual system
- typography
- color tokens
- spacing
- reusable components
- map/analysis layouts

Then connect Figma to Claude Code via the official Figma MCP integration.

### Playwright
Use Playwright MCP to:
- launch the prototype
- click map interactions
- test investigation flow
- verify responsive behavior
- catch broken UI states
- validate the actual rendered experience

### GitHub
Use GitHub for:
- source control
- issues
- branches
- version history

### Context7
Use Context7/live documentation tooling when Claude needs current library/framework documentation.

The key design principle:
**Figma = design source of truth**
**Claude Code = implementation**
**Playwright = browser validation**
**GitHub = source control**

---

## 26. Final instruction to Claude

Act as a senior product designer, frontend engineer, geospatial engineer and ML engineer.

Before coding:
1. Read this entire specification.
2. Read the current official FortyGuard documentation.
3. Inspect the existing repository.
4. Propose a concise implementation plan.
5. Implement in phases.
6. Keep the project runnable after every phase.
7. Use demo data when credentials are unavailable.
8. Never fabricate live API results.
9. Prioritize the "Why is this block hot?" experience.
10. Use browser testing before declaring the prototype complete.

The finished product should make a judge immediately understand:

> **This is an AI investigator for urban heat.**
>
> **It doesn't just show temperature.**
>
> **It gathers evidence and explains the anomaly.**
