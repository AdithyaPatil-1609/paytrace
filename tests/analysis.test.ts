import assert from "node:assert/strict";
import test from "node:test";
import { priyaCommitments } from "../data/priya";
import { groupByKind, isSilentPriceHike, isZombie, unusedTotal, yearlyTotal } from "../lib/analysis";

const find = (id: string) => priyaCommitments.find((item) => item.id === id)!;

test("1. adds every expected yearly projection", () => assert.equal(yearlyTotal(priyaCommitments), 199138));
test("2. identifies the total Priya does not use", () => assert.equal(unusedTotal(priyaCommitments), 27936));
test("3. recognises Spotify as a silent hike", () => assert.equal(isSilentPriceHike(find("spotify")), true));
test("4. keeps a trial that became paid distinct", () => assert.equal(find("youtube").kind, "trial"));
test("5. marks the eleven-month gym as unused", () => assert.equal(isZombie(find("fitline")), true));
test("6. does not call a recent service a zombie", () => assert.equal(isZombie({ ...find("fitline"), lastOpenedMonthsAgo: 1 }), false));
test("7. preserves variable electricity as essential", () => assert.equal(find("electricity").kind, "essential"));
test("8. keeps the home loan separate as debt", () => assert.equal(find("home-loan").kind, "debt"));
test("9. maintains a distinct group for every kind", () => assert.equal(Object.keys(groupByKind(priyaCommitments)).length, 5));
