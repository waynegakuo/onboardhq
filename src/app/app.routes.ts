import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Knowledge Base | Onboard HQ',
    loadComponent: () => import('./features/home/home').then((m) => m.HomeComponent),
  },
  {
    path: 'upload',
    title: 'Knowledge Sources | Onboard HQ',
    loadComponent: () => import('./features/upload/upload').then((m) => m.UploadComponent),
  },
];
