const { WebDriver, Builder, By, Key, until } = require('selenium-webdriver');
const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const { getTestEnvironments } = require('./test-env');
const ExtendedWebDriver = require('./ExtendedWebDriver');
const util = require('./util');

// selenium-webdriver docs: https://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/lib/webdriver.html

// TODO: this needs configurably target a local instance
let browserUrl = 'https://browser.blockstack.org';

for (const testEnvironment of getTestEnvironments()) {

  describe(`account creation [${testEnvironment.description}]`, () => {

    /** @type {ExtendedWebDriver} */
    let driver;

    step('create selenium webdriver', async () => {
      driver = await testEnvironment.createDriver();
      driver = new ExtendedWebDriver(driver);
    }).timeout(120000);

    step('load initial page', async () => {
      await driver.get(browserUrl);
    });

    step('load create new ID page', async () => {
      //if (process.env.BLOCKSTACK_REGISTRAR_API_KEY) {
      //  await driver.executeScript(`window.BLOCKSTACK_REGISTRAR_API_KEY = "${process.env.BLOCKSTACK_REGISTRAR_API_KEY}"`);
      //} else {
      //  console.warn('No BLOCKSTACK_REGISTRAR_API_KEY env var has been set. Username registrations may fail due to IP blocking.')
      //} 
      await driver.el(By.xpath('//div[text()="Create new ID"]'), el => el.click());
    });

    let randomUsername
    step('enter unique username', async () => {
      randomUsername = `test_e2e_${Date.now()/100000|0}_${util.getRandomInt(100000,999999)}`;
      await driver.el(By.css('input[type="text"][name="username"]'), el => el.sendKeys(randomUsername));
      await driver.el(By.xpath('//button[contains(., "Check Availability")]'), el => el.click());
      await driver.el(By.xpath('//button[contains(., "Continue")]'), el => el.click());
    });

    step('enter password', async () => {
      const randomPassword = util.getRandomString();
      await driver.el(By.css('input[type="password"][name="password"]'), el => el.sendKeys(randomPassword));
      await driver.el(By.css('input[type="password"][name="passwordConfirm"]'), el => el.sendKeys(randomPassword));
      await driver.el(By.xpath('//button[contains(., "Register ID")]'), el => el.click());
    });

    step('wait for creating Blockstack ID spinner', async () => {
      try {
        // first check if message is still showing (it may have been quick and already closed)
        await driver.wait(until.elementLocated(By.xpath('//*[contains(text(), "Creating your Blockstack ID")]')), 2500);
      } catch (err) {
        console.warn(`Error checking for "Creating your Blockstack ID" spinner: ${err}`);
      }
      // wait for next page to load
      await driver.el(By.xpath('//*[contains(text(), "What is your email")]'), null, 
        { timeout: 20000, poll: 200, driverWait: 20000 });
    });

    step('enter email', async () => {
      await driver.el(By.css('input[type="email"][name="email"]'), el => el.sendKeys(`${randomUsername}@none.test`));
      await driver.el(By.xpath('//button[contains(., "Next")]'), el => el.click());
    });

    step('expect recovery email to fail', async () => {
      // Expect recovery email delivery to fail (the email domain does not exist)
      await driver.el(By.xpath('//*[contains(., "email failed")]'));
    });

    step('check username registration failed', async () => {
      try {
        await driver.wait(until.elementLocated(By.xpath('//*[text()="Username Registration Failed"]')), 2500);
        console.warn('Username Registration Failed - does test server IP need whitelisted on the registar?')
        // close the alert since it can eclipse the continuation button..
        const el = await driver.el(By.xpath('//*[text()="Username Registration Failed"]/parent::div/following-sibling::div/descendant::span'), el => el.click());
        await driver.wait(until.elementIsNotVisible(el));
      } catch { }
    });

    step('acknowledge saving recovery key phrase', async () => {
      // First click redirects the page from /sign-up to /seed but doesn't change the form
      await driver.el(By.xpath('//div[text()="Secret Recovery Key"]/parent::div'), el => el.click());
      await driver.el(By.xpath('//div[contains(., "Save your Secret Recovery")]'));
      await driver.el(By.xpath('//div[text()="Secret Recovery Key"]/parent::div'), el => el.click());
    });

    step('wait for "unlocking recovery key"', async () => {
      try {
        // first check if message is still showing (it may have been quick and already closed)
        await driver.wait(until.elementLocated(By.xpath('//*[contains(text(), "Unlocking Recovery Key")]')), 2500);
      } catch (err) {
        console.warn(`Error checking for "Unlocking Recovery Key" spinner: ${err}`);
      }
      // wait for next page to load
      await driver.el(By.xpath('//*[text()="Your Secret Recovery Key"]/following-sibling::*'), null, 
        { timeout: 20000, poll: 200, driverWait: 20000 });
    });

    let keyWords;
    step('get secret recovery key phrase', async () => {
      // Get the recovery key phrase
      const keyEl = await driver.el(By.xpath('//*[text()="Your Secret Recovery Key"]/following-sibling::*'));
      keyWords = await keyEl.getText();
      keyWords = keyWords.trim().split(' ');
      expect(keyWords).lengthOf(12, 'Recovery key phrase should be 12 words');
      await driver.el(By.xpath('//div[text()="Continue"]/parent::div'), el => el.click());
    });

    step('perform recovery key phrase verification instructions', async () => {
      await driver.sleep(2500); // wait for animation
      const selectWordsEl = await driver.el(By.xpath('//*[contains(text(), "Select words #")]'));
      let selectWords = await selectWordsEl.getText();
      // Parse the phrase word numbers to validate
      selectWords = selectWords.match(/#([0-9]+)/g).map(s => keyWords[parseInt(s.slice(1)) - 1]);
      for (let selectWord of selectWords) {
        await driver.el(By.xpath(`//div[span[text()="${selectWord}"]]`), el => el.click());
      }
    });

    step('load main page as authenticated user', async () => {
      await driver.el(By.xpath('//div[text()="Go to Blockstack"]'), el => el.click())
      await driver.el(By.xpath('//*[text()="User-ready Apps"]'))
    });

    afterEach(function() {
      try {
        if (this.currentTest.state === 'failed') {
          const errDir = path.resolve(__dirname, 'errors');
          if (!fs.existsSync(errDir)) { fs.mkdirSync(errDir, { recursive: true }); }
          const screenshotFile = path.resolve(errDir, `screenshot-failed-${util.getRandomString()}.png`);
          return driver.screenshot(screenshotFile).then(() => {
            console.log(`screenshot for failure saved to ${screenshotFile}`);
          });
        }
      }
      catch { }
    });

    after(() => driver.quit());

  });
}
