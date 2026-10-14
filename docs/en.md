# Withings

This integration brings the data of your **Withings** devices into Gladys:
weight and body composition from a scale, blood pressure, heart rate,
temperature, steps and sleep from a watch or a Sleep Analyzer.

The data comes from the **Withings cloud** (the same data as the Withings app):
the integration does not talk to the devices on your network.

## What you get

| In Gladys                      | What it holds                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Withings health** device     | Your measures (weight, fat, muscle, blood pressure, heart rate, SpO2, temperature…), today's activity, last night's sleep, "in bed" state |
| One device per Withings device | "Battery low" (scales, blood pressure monitors, watches, thermometers)                                                                    |
| 5 scene triggers               | New measurement, got into bed, got out of bed, night summary available, steps goal reached                                                |
| 2 scene actions                | Refresh Withings data, read the last Withings value                                                                                       |
| 2 dashboard widgets            | Withings health (summary), Weight trend (chart)                                                                                           |

The features of the **Withings health** device follow what your account
actually measures: a blood pressure monitor owner gets blood pressure, not
twenty empty body-composition features. When a new kind of measure appears,
the device shows an **Update** button in the Discovery screen.

Measures keep **their own date**: a weigh-in synchronized an hour later is
stored at the time you stepped on the scale.

## Before you start

- A Withings account, with your devices set up in the **Withings app** (Health
  Mate) and synchronized.
- Gladys **5.1** or later.
- Optional: **Gladys Plus**, for real-time notifications (see below).

## 1. Create a Withings developer app

Withings asks every application that reads its data to be declared. It is
free and takes five minutes.

1. Go to [developer.withings.com](https://developer.withings.com/dashboard/)
   and sign in with your Withings account.
2. Create an application, of type **Public API integration**.
3. Give it a name (e.g. "My Gladys") and a description.
4. **Callback URL**: put a temporary address for now, for example
   `https://localhost/`. You will add the real one in step 3 below.
5. Save. Withings shows the **Client ID** and the **Client secret** of the app.

## 2. Configure the integration

In Gladys, open **Integrations → Withings → Configuration**:

| Field                                 | What to put                                                   |
| ------------------------------------- | ------------------------------------------------------------- |
| Client ID                             | The Client ID of your Withings app                            |
| Client secret                         | The Client secret of your Withings app                        |
| Refresh interval (min)                | How often Withings is read. 30 minutes by default (5 to 1440) |
| Daily steps goal                      | Used by the "Steps goal reached" trigger. 10,000 by default   |
| Real-time notifications (Gladys Plus) | On by default. Only works with Gladys Plus                    |

Save.

## 3. Connect your Withings account

1. Click **Connect** (field "Withings account").
2. The first time, Withings answers that the redirect address is not allowed
   (`redirect_uri`). This is expected: Withings only accepts addresses
   declared in your app.
3. Back in Gladys, click **Test the connection**: the message shows the
   **callback URL** Gladys uses. It is also in the integration logs
   ("Callback URL to declare in your Withings app").
4. On developer.withings.com, edit your app and add that address to the
   callback URLs. Save.
5. Click **Connect** again, sign in to Withings and accept.

The status turns to **Connected**, the integration reads one year of measures
(only the latest value of each one is put in Gladys), and the devices appear
in **Discovery**. Create them like any other device.

> The callback URL depends on the address you use to open Gladys. Always
> click Connect from the same address (the same one you declared).

## Real-time notifications (Gladys Plus)

Without Gladys Plus, the integration reads Withings at the refresh interval:
a weigh-in shows up in Gladys within 30 minutes (by default).

With **Gladys Plus**, Withings warns Gladys as soon as new data arrives:

1. In the integration's Configuration screen, fill the **Gladys Plus
   webhooks** block with your Gladys Plus Open API key.
2. Keep **Real-time notifications** on.

The integration then subscribes to the Withings notifications by itself. New
measures arrive in a few seconds, and a **Sleep Analyzer** sends the
**in bed** / **out of bed** events (these two only exist with Gladys Plus).

"Test the connection" says whether the notifications are active.

## Devices and features

### Withings health

| Feature                                                                     | Unit   | Notes                                 |
| --------------------------------------------------------------------------- | ------ | ------------------------------------- |
| Weight, fat mass, fat free mass, muscle mass, bone mass, body water         | kg     | Scale                                 |
| Fat ratio                                                                   | %      | Scale                                 |
| Visceral fat index                                                          | —      | Body Comp / Body Scan                 |
| Systolic / diastolic blood pressure                                         | mmHg   | Blood pressure monitor                |
| Heart rate                                                                  | bpm    | Scale, monitor                        |
| Blood oxygen (SpO2)                                                         | %      | ScanWatch                             |
| Body temperature, skin temperature                                          | °C     | Thermo, ScanWatch                     |
| Pulse wave velocity, vascular age                                           | m/s, — | Body Cardio, Body Scan                |
| Steps, distance, elevation, active and total calories (today)               | —, m   | Watch or phone; back to 0 at midnight |
| Sleep duration, deep / light / REM sleep, sleep score, wake-ups, heart rate | min, — | Last night, dated at the wake-up time |
| In bed                                                                      | 0 / 1  | Sleep Analyzer, Gladys Plus only      |

Gladys has no kilogram, bpm nor mmHg unit: those features show the unit in
their name.

### One device per Withings device

A **Battery low** feature (1 when Withings reports a low battery), for a
"replace the batteries" scene. A mains-powered Sleep Analyzer has none.

## Scenes

### Triggers

| Trigger                  | When                                              | Variables                                                  |
| ------------------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| New Withings measurement | A weigh-in, a blood pressure reading… is recorded | Kind, date, and every value of the measurement (weight, …) |
| Got into bed             | A Sleep Analyzer detects someone getting into bed | —                                                          |
| Got out of bed           | A Sleep Analyzer detects someone getting out      | —                                                          |
| Night summary available  | Withings has analysed last night                  | Sleep duration (min), sleep score, wake-ups                |
| Steps goal reached       | Today's steps reach the goal (once a day)         | Steps, goal                                                |

"New Withings measurement" can be filtered on the kind: weigh-in, blood
pressure, temperature, blood oxygen, other. Only recent measures (less than 24
hours old) fire it: connecting the account never replays old weigh-ins.

Example: _when a weigh-in arrives, send me "Weight: {{triggerEvent.data.weight}} kg"_.

### Actions

| Action                       | What it does                      | Results                           |
| ---------------------------- | --------------------------------- | --------------------------------- |
| Refresh Withings data        | Reads Withings now                | Number of new measures            |
| Read the last Withings value | The last known value of a measure | Known (yes/no), value, unit, date |

## Dashboard widgets

- **Withings health**: up to four live tiles (weight, steps, sleep, blood
  pressure…), the last measurement and synchronization, the notifications,
  the batteries, and a **Refresh** button.
- **Weight trend**: the current weight and its curve over a week, a month,
  three months or a year (setting of the widget).

## Configuration screen buttons

- **Test the connection**: account, devices, last synchronization,
  notifications and the callback URL to declare at Withings.
- **Synchronize now**: reads Withings at once.
- **Disconnect the Withings account**: forgets the tokens and stops the
  notifications. The devices stay in Gladys with their history.

## Troubleshooting

| Message / symptom                                | What to do                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| "Fill in the Client ID and the Client secret…"   | Fill both fields, save                                                            |
| Withings says `redirect_uri` is invalid          | Add the callback URL shown by "Test the connection" to your Withings app (step 3) |
| "Withings refused the connection… click Connect" | Access revoked, secret changed or token expired: click Connect again              |
| "Withings cannot be reached right now"           | Withings or your Internet is down; the integration retries at the next refresh    |
| Notifications "off (no Gladys Plus linked)"      | Fill the Gladys Plus webhooks block, or keep the timer only                       |
| A new measure type has no feature                | Discovery → Withings health → **Update**                                          |
| No "in bed" events                               | They need a Sleep Analyzer **and** Gladys Plus                                    |

The integration writes what it does in its logs (the container of the
integration), never a token nor the Client secret.

## Privacy

- Your data goes from the Withings cloud to **your** Gladys, through **your**
  developer app. Nothing goes through a third party (Gladys Plus only relays
  the "new data" notifications, which carry no measure).
- The Client secret and the tokens are stored in the Gladys configuration of
  the integration, never shown again and never written in the logs.
- The integration keeps a small file in its `/data` volume (last read, last
  values) so a restart neither duplicates measures nor fires scenes twice.
- One Withings account per installation of the integration.
