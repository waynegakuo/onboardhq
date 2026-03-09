import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then((m) => m.HomeComponent),
  },
  {
    path: 'upload',
    loadComponent: () => import('./features/upload/upload').then((m) => m.UploadComponent),
  },
];
