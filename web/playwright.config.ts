import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'**/*.spec.ts',workers:1,timeout:180000,
  expect:{timeout:15000},reporter:[['list'],['json',{outputFile:'test-results/results.json'}]],
  use:{baseURL:'http://127.0.0.1:4173/x3-batch/',viewport:{width:1440,height:950},
    acceptDownloads:true,headless:true,
    launchOptions:{executablePath:process.env.CHROMIUM_EXECUTABLE,
      args:process.env.CHROMIUM_EXECUTABLE?['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]},
    screenshot:'only-on-failure'},
  webServer:{command:'node tests/static-server.mjs',url:'http://127.0.0.1:4173/x3-batch/',reuseExistingServer:false},
});
