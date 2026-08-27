# Shared Firebase rules

`Bickers-Booking1` owns the production Firestore and Storage rules for the
`bickers-booking` Firebase project. The website and employee Expo app share that
project, so deploying rules from either repository independently can remove access
required by the other application.

Use only:

```sh
npm run deploy:firebase-rules
```

The command runs the Firestore and Storage emulator suites before deploying. The
test suites include mobile compatibility coverage for Working Terms, expenses,
equipment inspections, Recce photos, vehicle checks, general uploads, service and
defect evidence, equipment-inspection evidence, and profile pictures.
