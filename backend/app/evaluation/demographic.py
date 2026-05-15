from app.evaluation.context import DocumentEvaluationContext, TOTAL_POP_COL

def majority_districts(context: DocumentEvaluationContext) -> dict[str, list[int]]:
    """For each racial/ethnic group, returns the list of districts of which this group
    is the majority."""
    demo_data = context.demographic_data
    return {
        group_col.removesuffix("pop_20").removesuffix("_"):
          demo_data.index[(demo_data[group_col] > demo_data[TOTAL_POP_COL] / 2)].astype(int).tolist()
        for group_col in context.demographic_columns
    }
