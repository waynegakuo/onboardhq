import {ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import {initializeApp, provideFirebaseApp} from '@angular/fire/app';
import {environment} from '../environments/environment.development';
import {connectFunctionsEmulator, getFunctions, provideFunctions} from '@angular/fire/functions';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideFunctions(() => {
      const app = initializeApp(environment.firebaseConfig);
      const functions = getFunctions(app, 'africa-south1');
      if (isDevMode() && environment.emulator) {
        console.log(
          `Connecting to Functions emulator on ${environment.emulator.host}:${environment.emulator.functionsPort}`
        );
        connectFunctionsEmulator(
          functions,
          environment.emulator.host,
          environment.emulator.functionsPort
        );
      }
      return functions;
    }),
  ]
};
