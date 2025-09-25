import { defineStore } from 'pinia';

interface AppState {
  sidebarOpen: boolean;
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    sidebarOpen: false,
  }),
  actions: {
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
    },
    closeSidebar() {
      this.sidebarOpen = false;
    },
  },
});
