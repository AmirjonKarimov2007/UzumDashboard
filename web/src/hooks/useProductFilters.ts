"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { products } from "@/data/products";
import { emptyFilters, filterProducts, toggleFilterValue } from "@/lib/tableware-filters";
import type { FilterState } from "@/lib/tableware-types";

export function useProductFilters() {
  const searchParams = useSearchParams();
  const preselectedType = searchParams.get("restaurantType");
  const preselectedProductType = searchParams.get("productType");
  const [filters, setFilters] = useState<FilterState>({
    ...emptyFilters,
    restaurantTypes: preselectedType ? [preselectedType] : [],
    productTypes: preselectedProductType ? [preselectedProductType] : [],
  });

  const filteredProducts = useMemo(() => filterProducts(products, filters), [filters]);

  return {
    filters,
    products: filteredProducts,
    activeFilterCount:
      filters.restaurantTypes.length +
      filters.productTypes.length +
      filters.foodTypes.length +
      filters.materials.length +
      filters.sizes.length +
      filters.styles.length +
      filters.budgetSegments.length +
      filters.availability.length +
      (filters.search ? 1 : 0),
    setSearch: (search: string) => setFilters((current) => ({ ...current, search })),
    toggleFilter: (key: keyof FilterState, value: string) =>
      setFilters((current) => toggleFilterValue(current, key, value)),
    clearFilters: () => setFilters({ ...emptyFilters }),
  };
}
