#!/usr/bin/env bash
#
# Fills a demo school with a term's worth of realistic activity.
#
# Why this exists: a correct app in front of an empty database is
# indistinguishable from a broken one. Every screen honestly showed "—" and
# "₹0" because production had no registers, no invoices and no timetable, and
# the first reaction on seeing it was reasonably "the functionality is not
# working".
#
# Everything goes through the public API rather than straight into the tables,
# so this exercises the same code a real school would and fails where a real
# school would fail. That is not theoretical: writing it surfaced two genuine
# faults — invoice generation silently billing nobody for an unrecognised
# period label, and the fee ledger's totals being read from the wrong place.
#
#   bash scripts/seed-demo-activity.sh [base-url]
#
# Safe to re-run: registers upsert, invoice generation is idempotent per
# period, and students are only added if the class is below its target size.

set -uo pipefail

B="${1:-https://school.poetreepublications.com/api/v1}"
PASSWORD="${DEMO_PASSWORD:-School@2026}"
TARGET_CHILDREN=12

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }

login() {
  curl -s -X POST "$B/auth/login" -H 'content-type: application/json' \
    -d "{\"identifier\":\"$1\",\"password\":\"$PASSWORD\"}" \
    | python -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))"
}

ADMIN=$(login admin@sunrise.test)
TEACHER=$(login anita@sunrise.test)
if [ -z "$ADMIN" ] || [ -z "$TEACHER" ]; then
  echo "Could not sign in. Is $B reachable, and is the demo password right?" >&2
  exit 1
fi
AH="Authorization: Bearer $ADMIN"
TH="Authorization: Bearer $TEACHER"
JS='content-type: application/json'

api() { # method path token body
  curl -s -o /tmp/seed-out.json -w '%{http_code}' -X "$1" "$B$2" -H "$3" -H "$JS" ${4:+-d "$4"}
}
field() { python -c "import sys,json;print(json.load(sys.stdin).get('$1',''))" < /tmp/seed-out.json; }

# ------------------------------------------------------------------- context
AY=$(curl -s -H "$AH" "$B/academic-years" | python -c "
import sys,json
for y in json.load(sys.stdin):
    if y.get('isCurrent'): print(y['id']); break")
read -r CLS LEVEL_CODE <<<"$(curl -s -H "$AH" "$B/classrooms" | python -c "
import sys,json;d=json.load(sys.stdin);print(d[0]['id'], d[0]['classLevel']['code'])")"
LEVEL_ID=$(curl -s -H "$AH" "$B/class-levels" | python -c "
import sys,json
for l in json.load(sys.stdin):
    if l['code']=='$LEVEL_CODE': print(l['id']); break")
EXISTING_ADMISSIONS=$(curl -s -H "$AH" "$B/students?pageSize=100" | python -c "
import sys,json
print(' '.join(s['fullName'] for s in json.load(sys.stdin)['items']))")

say "Sunrise Preschool · $LEVEL_CODE · year $AY"

# ------------------------------------------------------------------ children
# A register of two children does not look like a class.
say "Children"
NAMES=("Aarav Joshi" "Diya Kulkarni" "Vivaan Shah" "Anaya Patil" "Reyansh Desai"
       "Myra Iyer" "Kabir Rao" "Saanvi Menon" "Arjun Bhat" "Ira Chavan"
       "Neel Gokhale" "Tara Pillai")

COUNT=$(curl -s -H "$AH" "$B/students?pageSize=100" | python -c "
import sys,json;print(len(json.load(sys.stdin)['items']))")
note "already enrolled: $COUNT"

i=0
for name in "${NAMES[@]}"; do
  i=$((i+1))
  [ "$COUNT" -ge "$TARGET_CHILDREN" ] && break

  FIRST=${name%% *}; LAST=${name#* }

  # Skip a name the school already has, or the demo grows a second Aarav
  # Joshi beside the seeded one and nobody can tell them apart.
  case " $EXISTING_ADMISSIONS " in *" $FIRST "*) note "skipped $name — already enrolled"; continue ;; esac

  # A parent PER CHILD. Reusing one profile for everybody made that parent the
  # guardian of the whole class, so signing in showed eleven children in the
  # switcher — which reads as a data leak even though the app was faithfully
  # listing children they really were linked to.
  SLUG=$(echo "$LAST" | tr '[:upper:]' '[:lower:]')
  PARENT=$(curl -s -X POST "$B/parents" -H "$AH" -H "$JS" \
    -d "{\"name\":\"$LAST family\",\"phone\":\"+9190000$(printf '%05d' $((10000+i)))\",\"password\":\"$PASSWORD\",\"relation\":\"GUARDIAN\",\"email\":\"$SLUG$i@sunrise.test\"}" \
    | python -c "import sys,json
try: print(json.load(sys.stdin)['id'])
except Exception: print('')")

  if [ -z "$PARENT" ]; then
    note "could not create a guardian for $name — skipping"
    continue
  fi

  ADM="SUN-$(printf '%03d' $((100+i)))"
  YEAR=$((2021 + (i % 3)))
  code=$(api POST /students "$AH" "{\"firstName\":\"$FIRST\",\"lastName\":\"$LAST\",\"dateOfBirth\":\"$YEAR-0$((1+i%9))-1$((i%9))\",\"gender\":\"$([ $((i%2)) -eq 0 ] && echo FEMALE || echo MALE)\",\"admissionNo\":\"$ADM\",\"rollNo\":\"$i\",\"classroomId\":\"$CLS\",\"guardians\":[{\"parentProfileId\":\"$PARENT\",\"relation\":\"GUARDIAN\",\"isPrimary\":true}]}")
  if [ "$code" = "201" ]; then
    COUNT=$((COUNT+1))
    note "added $name with their own guardian"
  fi
done
note "class size now: $COUNT"

STUDENTS=$(curl -s -H "$AH" "$B/students?pageSize=100" | python -c "
import sys,json;print(' '.join(s['id'] for s in json.load(sys.stdin)['items']))")

# ---------------------------------------------------------------- attendance
# Marked as the ADMIN, not the teacher: teachers may only edit today and
# yesterday, and backfilling six weeks of history is exactly the correction
# power that grace window is meant to reserve for the office.
say "Attendance — six weeks of weekdays"
marked=0
for back in $(seq 0 44); do
  DAY=$(date -u -d "$back days ago" +%Y-%m-%d 2>/dev/null || date -u -v-${back}d +%Y-%m-%d)
  DOW=$(date -u -d "$DAY" +%u 2>/dev/null || date -u -j -f %Y-%m-%d "$DAY" +%u)
  [ "$DOW" -gt 5 ] && continue

  RECORDS=""; i=0
  for s in $STUDENTS; do
    i=$((i+1))
    # Roughly 93% present, with the odd late arrival — a register that reads
    # 100% every day tells a parent nothing.
    case $(( (back * 7 + i * 3) % 29 )) in
      0|1) STATUS=ABSENT ;;
      5)   STATUS=LATE ;;
      11)  STATUS=LEAVE ;;
      *)   STATUS=PRESENT ;;
    esac
    [ -n "$RECORDS" ] && RECORDS="$RECORDS,"
    RECORDS="$RECORDS{\"studentId\":\"$s\",\"status\":\"$STATUS\"}"
  done

  code=$(api PUT /attendance "$AH" "{\"classroomId\":\"$CLS\",\"date\":\"$DAY\",\"records\":[$RECORDS]}")
  [ "$code" = "200" ] && marked=$((marked+1))
done
note "registers: $marked"

# ---------------------------------------------------------------------- fees
say "Fees"
api POST /fees/heads "$AH" '{"code":"TUITION","name":"Tuition"}' >/dev/null
HEAD=$(curl -s -H "$AH" "$B/fees/heads" | python -c "
import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')")

api PUT /fees/structures "$AH" "{\"academicYearId\":\"$AY\",\"classLevelId\":\"$LEVEL_ID\",\"name\":\"$LEVEL_CODE fees 2026-27\",\"items\":[{\"feeHeadId\":\"$HEAD\",\"amountInPaise\":1200000,\"frequency\":\"QUARTERLY\",\"dueDayOfMonth\":10}]}" >/dev/null
note "structure: ₹12,000 per quarter"

# Q1 is already past its due date, so it shows as overdue where unpaid. Q2 is
# ahead. The labels are fixed by the cadence — Q1..Q4 for quarterly.
DUE_Q1=$(date -u -d '25 days ago' +%Y-%m-%d 2>/dev/null || date -u -v-25d +%Y-%m-%d)
DUE_Q2=$(date -u -d '35 days' +%Y-%m-%d 2>/dev/null || date -u -v+35d +%Y-%m-%d)
api POST /fees/invoices/generate "$AH" "{\"academicYearId\":\"$AY\",\"periodLabel\":\"Q1\",\"dueDate\":\"$DUE_Q1\"}" >/dev/null
note "Q1: $(field created) raised, $(field skipped) already billed"
api POST /fees/invoices/generate "$AH" "{\"academicYearId\":\"$AY\",\"periodLabel\":\"Q2\",\"dueDate\":\"$DUE_Q2\"}" >/dev/null
note "Q2: $(field created) raised, $(field skipped) already billed"

# Three states a school actually has: paid up, part paid, and not paid.
PAID=$(date -u -d '20 days ago' +%Y-%m-%d 2>/dev/null || date -u -v-20d +%Y-%m-%d)
full=0; part=0; none=0; n=0
for s in $STUDENTS; do
  n=$((n+1))
  OWED=$(curl -s -H "$AH" "$B/fees/students/$s/ledger" | python -c "
import sys,json;print(json.load(sys.stdin)['totals']['outstanding'])")
  [ "$OWED" -le 0 ] && continue
  case $((n % 3)) in
    1) AMT=$OWED; full=$((full+1)) ;;
    2) AMT=$((OWED / 2)); part=$((part+1)) ;;
    *) none=$((none+1)); continue ;;
  esac
  [ "$AMT" -lt 1 ] && continue
  api POST /fees/payments "$AH" "{\"studentId\":\"$s\",\"amountInPaise\":$AMT,\"method\":\"UPI\",\"paidOn\":\"$PAID\",\"reference\":\"UPI$(printf '%04d' $n)\"}" >/dev/null
done
note "settled in full: $full · part paid: $part · unpaid: $none"

# ----------------------------------------------------------------- timetable
say "Timetable"
mkperiod() {
  curl -s -X POST "$B/timetable/periods" -H "$AH" -H "$JS" \
    -d "{\"academicYearId\":\"$AY\",\"name\":\"$1\",\"startTime\":\"$2\",\"endTime\":\"$3\",\"sortOrder\":$4,\"isBreak\":$5}" \
    | python -c "import sys,json
try: print(json.load(sys.stdin)['id'])
except Exception: print('')"
}
EXISTING=$(curl -s -H "$AH" "$B/timetable/periods" | python -c "
import sys,json;d=json.load(sys.stdin);print(' '.join(p['id'] for p in d))")
if [ -z "$EXISTING" ]; then
  P1=$(mkperiod "Circle time" "09:00" "09:40" 1 false)
  P2=$(mkperiod "Letters"     "09:45" "10:25" 2 false)
  mkperiod "Snack"            "10:25" "10:50" 3 true >/dev/null
  P4=$(mkperiod "Numbers"     "10:50" "11:30" 4 false)
  P5=$(mkperiod "Play"        "11:30" "12:10" 5 false)
else
  read -r P1 P2 _ P4 P5 <<<"$EXISTING"
fi

SUBJ=$(curl -s -H "$AH" "$B/subjects" | python -c "
import sys,json;d=json.load(sys.stdin);print(' '.join(s['id'] for s in d[:2]))")
read -r S1 S2 <<<"${SUBJ:-  }"

SLOTS=""
for d in 1 2 3 4 5; do
  for pair in "$P1|$S1" "$P2|$S1" "$P4|$S2" "$P5|$S2"; do
    pid=${pair%%|*}; sid=${pair##*|}
    [ -z "$pid" ] && continue
    [ -n "$SLOTS" ] && SLOTS="$SLOTS,"
    if [ -n "$sid" ]; then
      SLOTS="$SLOTS{\"dayOfWeek\":$d,\"periodId\":\"$pid\",\"subjectId\":\"$sid\"}"
    else
      SLOTS="$SLOTS{\"dayOfWeek\":$d,\"periodId\":\"$pid\"}"
    fi
  done
done
code=$(api PUT "/timetable/classrooms/$CLS" "$AH" "{\"slots\":[$SLOTS]}")
note "week saved ($code)"

# ------------------------------------------------------------------ homework
say "Homework"
mkhw() {
  DUE=$(date -u -d "$2 days" +%Y-%m-%d 2>/dev/null || date -u -v+${2}d +%Y-%m-%d)
  HW=$(curl -s -X POST "$B/homework" -H "$TH" -H "$JS" \
    -d "{\"classroomId\":\"$CLS\",\"title\":\"$1\",\"description\":\"$3\",\"dueDate\":\"$DUE\",\"allowsSubmission\":true}" \
    | python -c "import sys,json
try: print(json.load(sys.stdin)['id'])
except Exception: print('')")
  [ -n "$HW" ] && curl -s -o /dev/null -X POST "$B/homework/$HW/publish" -H "$TH" && note "$1"
}
mkhw "Practise letter A"  3 "One page of the letter A, big and small."
mkhw "Count to ten"       6 "Count the buttons on your shirt with a grown-up."
mkhw "Draw your family"   9 "Any colours you like."

# --------------------------------------------------------------- class stream
say "Class stream"
stream_post() {
  code=$(api POST /classroom-posts "$TH" "{\"classroomId\":\"$CLS\",\"type\":\"$1\",\"title\":\"$2\",\"body\":\"$3\"}")
  note "$2 ($code)"
}
stream_post ANNOUNCEMENT "Water bottles, please" "It is warm this week. Please send a named water bottle every day."
stream_post ANNOUNCEMENT "We planted beans today" "Everyone planted a bean in a cup. They are on the window sill and we will measure them on Friday."
stream_post MATERIAL "Letter A worksheet" "Print at home if you would like some extra practice."

say "Done"
