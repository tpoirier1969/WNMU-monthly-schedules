window.WNMU_MONTHLY_PAGE_CONFIG = {
  "buildVersion": "v1.3.1",
  "channelCode": "13.3",
  "channelLabel": "WNMU3PL",
  "scheduleFile": "schedule-data.v1.0.0.json",
  "verificationFile": "verification.v1.0.0.json",
  "storageKey": "wnmu3plMay2026Marks.v1.0.0",
  "useSourceInId": true,
  "tagOrder": [
    "newSeries",
    "highlight",
    "oneOff",
    "monthlyTopic",
    "fundraiser",
    "programmersChoice",
    "holiday",
    "noteworthy",
    "educational",
    "local",
    "arts"
  ],
  "tagPriority": [
    "holiday",
    "fundraiser",
    "programmersChoice",
    "arts",
    "educational",
    "highlight",
    "newSeries",
    "noteworthy",
    "local",
    "oneOff",
    "monthlyTopic"
  ],
  "tagMeta": {
    "newSeries": {
      "label": "New Series",
      "color": "var(--new-series)"
    },
    "highlight": {
      "label": "Highlight",
      "color": "var(--highlight)"
    },
    "oneOff": {
      "label": "One Off",
      "color": "var(--one-off)"
    },
    "monthlyTopic": {
      "label": "Monthly topic",
      "color": "var(--monthly-topic)"
    },
    "fundraiser": {
      "label": "Fundraiser",
      "color": "var(--fundraiser)"
    },
    "programmersChoice": {
      "label": "Programmer's Choice",
      "color": "var(--programmers-choice)"
    },
    "holiday": {
      "label": "Holiday",
      "color": "var(--holiday)"
    },
    "noteworthy": {
      "label": "Noteworthy",
      "color": "var(--noteworthy)"
    },
    "educational": {
      "label": "Educational",
      "color": "var(--educational)"
    },
    "local": {
      "label": "Local",
      "color": "var(--local)"
    },
    "arts": {
      "label": "Arts",
      "color": "var(--arts)"
    }
  },
  "suppressAllAutoRules": [
    {
      "range": [
        "00:00",
        "09:30"
      ]
    },
    {
      "weekdays": [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      "range": [
        "09:30",
        "17:30"
      ]
    },
    {
      "weekdays": [
        "Saturday"
      ],
      "range": [
        "09:30",
        "16:00"
      ]
    }
  ],
  "suppressNewSeriesRules": [],
  "autoTagRules": [
    {
      "tag": "programmersChoice",
      "weekdays": [
        "Sunday"
      ],
      "times": [
        "19:00"
      ]
    },
    {
      "tag": "educational",
      "weekdays": [
        "Saturday"
      ],
      "times": [
        "20:00"
      ]
    },
    {
      "tag": "arts",
      "weekdays": [
        "Saturday"
      ],
      "range": [
        "17:00",
        "20:00"
      ]
    },
    {
      "tag": "arts",
      "weekdays": [
        "Sunday"
      ],
      "range": [
        "10:00",
        "13:00"
      ]
    }
  ]
};
