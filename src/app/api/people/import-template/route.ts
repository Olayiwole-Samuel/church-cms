import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/http";

const TEMPLATE = [
  "Full name,Phone,Email,Gender,Address,First visit date,Department,Tags,Source",
  "Grace Adebayo,08031234567,grace@example.com,Female,12 Church Road,15/03/2026,Choir,Member,Invited by a friend",
  "Samuel Okoro,08099887766,,Male,,2026-01-04,Ushering,,",
].join("\r\n");

/** A sample file showing the columns the importer understands. */
export const GET = adminRoute(async () =>
  new NextResponse(`﻿${TEMPLATE}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="people-import-template.csv"',
    },
  }),
);
