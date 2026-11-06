"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadarAgentCard } from "@/components/ai-radar/RadarAgentCard";
import { RadarUpdates } from "@/components/ai-radar/RadarUpdates";
import { RadarCoverage } from "@/components/ai-radar/RadarCoverage";
import { getRadarFilterOptions } from "@/lib/actions/ai-radar";

const ALL = "all";

const AIPolicyUpdate = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [region, setRegion] = useState<string>();
  const [country, setCountry] = useState<string>();
  const [category, setCategory] = useState<string>();
  // Bumped when a Radar run finishes so the list reloads.
  const [updatesKey, setUpdatesKey] = useState(0);
  const onRunFinished = useCallback(() => setUpdatesKey((k) => k + 1), []);

  const [options, setOptions] = useState<{
    regions: string[];
    countries: string[];
    categories: string[];
  }>({ regions: [], countries: [], categories: [] });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Countries follow the chosen region (all countries when no region is picked).
  useEffect(() => {
    getRadarFilterOptions(region)
      .then(setOptions)
      .catch((err) => console.error("Error fetching filter options:", err));
  }, [region]);

  const pick =
    (set: (v: string | undefined) => void) => (value: string) =>
      set(value === ALL ? undefined : value);

  const hasActiveFilters = searchTerm || region || country || category;
  const clearAllFilters = () => {
    setSearchTerm("");
    setRegion(undefined);
    setCountry(undefined);
    setCategory(undefined);
  };

  return (
    <div className="flex flex-col p-5">
      <PageHeader
        title="AI Radar"
        description="Watches official sources for new AI laws, regulations and policies every 3 days. Every update links to its source."
      />
      <RadarAgentCard onRunFinished={onRunFinished} />

      <Tabs defaultValue="updates" className="mt-6">
        {/* Underline tabs, same look as the Regulations | Frameworks tabs */}
        <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0">
          {[
            ["updates", "Latest updates"],
            ["coverage", "Coverage"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-2 text-muted-foreground shadow-none data-[state=active]:border-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-muted-foreground dark:data-[state=active]:bg-transparent"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="coverage" className="mt-4">
          <RadarCoverage />
        </TabsContent>

        <TabsContent value="updates">
          <div className="mt-6 flex w-full flex-wrap items-center gap-4">
            <div className="relative min-w-[240px] flex-[2]">
              <Input
                type="search"
                placeholder="Search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="min-w-[160px] flex-1">
              <Select
                value={region ?? ALL}
                onValueChange={(v) => {
                  pick(setRegion)(v);
                  setCountry(undefined); // the old country may not be in the new region
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Regions</SelectItem>
                  {options.regions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px] flex-1">
              <Select value={country ?? ALL} onValueChange={pick(setCountry)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Countries</SelectItem>
                  {options.countries.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px] flex-1">
              <Select value={category ?? ALL} onValueChange={pick(setCategory)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Topic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Topics</SelectItem>
                  {options.categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  onClick={clearAllFilters}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="mt-6">
            <RadarUpdates
              filters={{
                region,
                country,
                category,
                search: debouncedSearchTerm || undefined,
              }}
              refreshKey={updatesKey}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AIPolicyUpdate;
