window.WNMU_MONTHLY_PAGE_CONFIG = {
  "buildVersion": "v1.2.1",
  "channelCode": "13.1",
  "channelLabel": "WNMU1HD",
  "scheduleFile": "schedule-data.v1.0.5.json",
  "verificationFile": "verification.v1.0.5.json",
  "storageKey": "wnmu1hdMay2026Marks.v1.0.5",
  "useSourceInId": false,
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
    "michigan"
  ],
  "tagPriority": [
    "holiday",
    "fundraiser",
    "programmersChoice",
    "michigan",
    "local",
    "educational",
    "highlight",
    "newSeries",
    "noteworthy",
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
    "michigan": {
      "label": "Michigan",
      "color": "var(--michigan)"
    }
  },
  "suppressAllAutoRules": [],
  "suppressNewSeriesRules": [
    {
      "range": [
        "01:00",
        "07:00"
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
        "08:30",
        "15:00"
      ]
    }
  ],
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
      "tag": "programmersChoice",
      "weekdays": [
        "Saturday"
      ],
      "times": [
        "20:00"
      ]
    },
    {
      "tag": "local",
      "weekdays": [
        "Thursday"
      ],
      "times": [
        "20:00"
      ]
    },
    {
      "tag": "local",
      "weekdays": [
        "Friday"
      ],
      "times": [
        "15:00"
      ]
    },
    {
      "tag": "local",
      "weekdays": [
        "Saturday"
      ],
      "times": [
        "18:00"
      ]
    },
    {
      "tag": "local",
      "weekdays": [
        "Sunday"
      ],
      "times": [
        "14:00"
      ]
    },
    {
      "tag": "michigan",
      "weekdays": [
        "Thursday"
      ],
      "times": [
        "21:00",
        "21:30",
        "22:00",
        "22:30"
      ]
    },
    {
      "tag": "michigan",
      "weekdays": [
        "Friday"
      ],
      "times": [
        "20:30"
      ]
    },
    {
      "tag": "michigan",
      "weekdays": [
        "Sunday"
      ],
      "times": [
        "12:30"
      ]
    }
  ]
};
