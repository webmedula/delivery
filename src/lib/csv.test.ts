import { describe, expect, it } from "vitest";
import { toCSV } from "./csv";

describe("toCSV", () => {
  it("usa ; e BOM, e escapa aspas", () => {
    expect(toCSV([["Nome", "Obs"], ['Ana "A"', "a;b"]])).toBe('﻿Nome;Obs\r\n"Ana ""A""";"a;b"\r\n');
  });
  it("neutraliza fórmulas", () => {
    expect(toCSV([["=HYPERLINK(1)", "-2"]])).toBe("﻿'=HYPERLINK(1);'-2\r\n");
  });
});
