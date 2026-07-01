window.WNMU_MONTHLY_PAGE_CONFIG = {
  "buildVersion": "v1.5.94",
  "packageVersion": "v1.5.94",
  "channelCode": "13.1",
  "channelLabel": "WNMU1HD",
  "registryFile": "data/month-registry.v1.4.1.json",
  "sharedRendererFile": "wnmu-monthly-shared.v1.3.1.js",
  "loaderVersion": "v1.5.94",
  "useSourceInId": false,
  "tagOrder": ["highlight","newSeries","newSeason","oneOff","monthlyTopic","fundraiser","programmersChoice","holiday","educational","local","michigan"],
  "tagPriority": ["highlight","newSeries","newSeason","holiday","fundraiser","programmersChoice","michigan","local","educational","oneOff","monthlyTopic"],
  "tagMeta": {
    "newSeries": { "label": "New Series", "color": "var(--new-series)" },
    "newSeason": { "label": "New Season", "color": "var(--new-season)" },
    "highlight": { "label": "Highlight", "color": "var(--highlight)" },
    "oneOff": { "label": "One Off", "color": "var(--one-off)" },
    "monthlyTopic": { "label": "Monthly topic", "color": "var(--monthly-topic)" },
    "fundraiser": { "label": "Fundraiser", "color": "#ff4d5a" },
    "programmersChoice": { "label": "Programmer's Choice", "color": "var(--programmers-choice)" },
    "holiday": { "label": "Holiday", "color": "var(--holiday)" },
    "educational": { "label": "Educational", "color": "var(--educational)" },
    "local": { "label": "Local", "color": "var(--local)" },
    "michigan": { "label": "Michigan", "color": "var(--michigan)" }
  },
  "suppressAllAutoRules": [],
  "suppressNewSeriesRules": [
    { "range": ["01:00", "07:00"] },
    { "weekdays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "range": ["08:30", "15:00"] }
  ],
  "autoSuppressSatelliteFeed": true,
  "autoTagRules": [
    { "tag": "programmersChoice", "weekdays": ["Sunday"], "times": ["19:00"] },
    { "tag": "programmersChoice", "weekdays": ["Saturday"], "times": ["20:00"] },
    { "tag": "local", "weekdays": ["Thursday"], "times": ["20:00"] },
    { "tag": "local", "weekdays": ["Friday"], "times": ["15:00"] },
    { "tag": "local", "weekdays": ["Saturday"], "times": ["18:00"] },
    { "tag": "local", "weekdays": ["Sunday"], "times": ["14:00"] },
    { "tag": "michigan", "weekdays": ["Thursday"], "times": ["21:00", "21:30", "22:00", "22:30"] },
    { "tag": "michigan", "weekdays": ["Friday"], "times": ["20:30"] },
    { "tag": "michigan", "weekdays": ["Sunday"], "times": ["12:30"] }
  ]
};
