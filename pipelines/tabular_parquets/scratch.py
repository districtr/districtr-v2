# %%
import duckdb
import pandas as pd

df = pd.read_parquet("test_texas_vtd_blocks_with_groups.parquet")
df_long = df.melt(id_vars=['path', 'parent_path'], var_name='column_name', value_name='value')
df_long = df_long.sort_values(['parent_path', 'path', 'column_name'])
df_long = df_long.reset_index(drop=True)
df_long.to_parquet("test_texas_vtd_blocks_with_groups_long.parquet")
con = duckdb.connect(database=":memory:")
con.sql(
    "CREATE TABLE blocks_with_metadata AS SELECT * FROM read_parquet('test_texas_vtd_blocks_with_groups_long.parquet')"
)
# fill parent_path with parent if length 0
df_long['parent_path'] = df_long['parent_path'].fillna('parent')
# Use groupby to efficiently compute min and max indices
grouped = df_long.groupby("parent_path").apply(lambda x: int(x.index.max()) - int(x.index.min()))
length_list = '|'.join([str(v) for v in list(grouped.values)])
con.execute("SET threads=1;")
con.sql(
    f"""
    COPY (
        SELECT
            path,
            column_name,
            value
        FROM blocks_with_metadata
    )
    TO 'output_with_kv_test_long2.parquet'
    (
        FORMAT 'parquet',
        COMPRESSION 'zstd',
        COMPRESSION_LEVEL 12,
        OVERWRITE_OR_IGNORE true,
        KV_METADATA {{
          column_list: {[f'"{entry}"' for entry in df_long['column_name'].unique().tolist()]},
          length_list: {list(grouped.values)}
        }}
    );
    """
)
# %%
