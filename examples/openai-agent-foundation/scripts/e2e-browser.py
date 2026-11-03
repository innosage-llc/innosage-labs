#!/usr/bin/env python3
"""Mac Studio headless Chrome E2E. Synthetic-only; does not run OpenAI API."""
import os
import sys
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
TOKEN=(ROOT/".local-run/access.token").read_text(encoding="utf-8").strip()
LAN_IP=subprocess.check_output([str(ROOT/".venv/bin/python"),str(ROOT/"scripts/lan-tls.py"),"discover"],text=True).strip()
URL=os.environ.get("FOUNDATION_TEST_URL",f"https://{LAN_IP}:8434/")

def run():
    console_errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel="chrome",headless=True,args=["--no-first-run"])
        # Only the isolated synthetic browser test bypasses certificate-trust UI.
        # Real users must explicitly trust the private CA; production TLS stays enforced.
        page=browser.new_page(viewport={"width":1420,"height":900},device_scale_factor=1,
                              ignore_https_errors=True)
        page.on("pageerror",lambda err: console_errors.append(str(err)))
        page.on("console",lambda msg: console_errors.append(msg.text) if msg.type=="error" else None)
        page.goto(URL,wait_until="domcontentloaded")
        page.locator("#login").wait_for(state="visible")
        page.locator("#token").fill(TOKEN)
        page.locator("#login-submit").click()
        page.locator("#login").wait_for(state="hidden")
        print("PASS: Browser authentication")
        reset=page.locator('[data-action="reset"]')
        page.once("dialog",lambda dialog: dialog.accept())
        reset.click()
        page.wait_for_timeout(450)
        page.locator('[data-action="load"]').click()
        page.locator("#bots-list .bot").first.wait_for()
        assert page.locator("#bots-list .bot").count()==2
        print("PASS: Two persistent bot identities")
        page.locator('[data-action="round"]').first.click()
        page.locator("#round-list .round-card").first.wait_for()
        assert page.locator("#round-list .round-card").count()==1
        assert "CONTINUE" in page.locator("#round-list .round-card").first.inner_text()
        assert "EDITOR OUTPUT" in page.locator("#round-list .round-card").first.inner_text()
        print("PASS: Run 1 decision and Editor draft")
        page.locator('#steps [data-action="approve"]').click()
        page.locator('#steps [data-action="publish"]').click()
        page.locator('#steps [data-action="feedback"]').click()
        page.locator('#steps [data-action="round"]').click()
        page.locator("#round-list .round-card").nth(1).wait_for()
        assert page.locator("#round-list .round-card").count()==2
        assert "ADJUST" in page.locator("#round-list .round-card").nth(1).inner_text()
        assert "feedback-run-01" in page.locator("#learning-content").inner_text()
        print("PASS: Run 2 consumes synthetic audience evidence and adjusts")
        page.locator('#steps [data-action="scrollInbox"]').click()
        expect(page.locator("#inbox-list")).to_contain_text("Strategy proposal",timeout=10000)
        before_approval=page.request.get(URL+"api/dashboard",headers={"Authorization":"Bearer "+TOKEN}).json()
        assert before_approval["strategy"]["version"]==1
        page.locator('#inbox-list [data-action="strategyApprove"]').click()
        expect(page.locator("#learning-content")).to_contain_text("Version 2",timeout=10000)
        page.locator('[data-action="counterfactual"]').click()
        expect(page.locator("#inspect-output")).to_contain_text("changes_with_counterfactual",timeout=10000)
        page.locator('[data-action="projection"]').click()
        expect(page.locator("#inspect-output")).to_contain_text('"sdk_compaction_executed": false',timeout=10000)
        print("PASS: Strategy approval, counterfactual, durable projection")
        page.reload(wait_until="domcontentloaded")
        page.locator("#login").wait_for(state="hidden")
        assert page.locator("#round-list .round-card").count()==2
        expect(page.locator("#learning-content")).to_contain_text("Version 2",timeout=10000)
        print("PASS: Reload retains browser-visible decisions")
        out=ROOT/".local-run/browser-e2e.png"
        page.screenshot(path=str(out),full_page=True)
        print("SCREENSHOT_PRIVATE:",out)
        if console_errors:
            print("FAIL browser errors:",console_errors)
            raise AssertionError("Browser JS exceptions or console errors")
        print("PASS: No browser JS errors")
        # Leave a clean, preloaded sample for founder's own browser walkthrough.
        page.once("dialog",lambda dialog: dialog.accept())
        page.locator('[data-action="reset"]').click()
        page.wait_for_timeout(400)
        page.locator('[data-action="load"]').click()
        expect(page.locator("#bots-list .bot")).to_have_count(2,timeout=10000)
        expect(page.locator("#round-list .round-card")).to_have_count(0,timeout=10000)
        print("PASS: User demo reset and preloaded")
        browser.close()

if __name__=="__main__":
    run()
