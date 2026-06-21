import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
  type CheckpointListOptions,
  type ChannelVersions,
  type PendingWrite,
  type CheckpointPendingWrite,
  copyCheckpoint,
  getCheckpointId,
  WRITES_IDX_MAP
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import { prisma } from "./prisma";

export class PrismaCheckpointer extends BaseCheckpointSaver {
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    let checkpointId = getCheckpointId(config);

    if (!threadId) {
      return undefined;
    }

    let dbCheckpoint;
    if (checkpointId) {
      dbCheckpoint = await prisma.checkpoint.findUnique({
        where: {
          threadId_checkpointNs_checkpointId: {
            threadId,
            checkpointNs,
            checkpointId,
          },
        },
      });
    } else {
      dbCheckpoint = await prisma.checkpoint.findFirst({
        where: {
          threadId,
          checkpointNs,
        },
        orderBy: {
          checkpointId: "desc",
        },
      });
    }

    if (!dbCheckpoint) {
      return undefined;
    }

    const checkpoint = await this.serde.loadsTyped(
      "json",
      JSON.stringify(dbCheckpoint.checkpoint)
    ) as Checkpoint;

    const metadata = await this.serde.loadsTyped(
      "json",
      JSON.stringify(dbCheckpoint.metadata)
    ) as CheckpointMetadata;

    // Fetch pending writes for this checkpoint
    const dbWrites = await prisma.checkpointWrite.findMany({
      where: {
        threadId,
        checkpointNs,
        checkpointId: dbCheckpoint.checkpointId,
      },
      orderBy: [
        { taskId: "asc" },
        { idx: "asc" },
      ],
    });

    const pendingWrites: CheckpointPendingWrite[] = await Promise.all(
      dbWrites.map(async (w) => {
        const val = await this.serde.loadsTyped(
          "json",
          JSON.stringify(w.value)
        );
        return [w.taskId, w.channel, val] as CheckpointPendingWrite;
      })
    );

    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: dbCheckpoint.checkpointId,
        },
      },
      checkpoint,
      metadata,
      pendingWrites,
    };

    if (dbCheckpoint.parentCheckpointId) {
      tuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: dbCheckpoint.parentCheckpointId,
        },
      };
    }

    return tuple;
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns;
    const checkpointId = config.configurable?.checkpoint_id;
    const { before, limit, filter } = options ?? {};

    const where: any = {};
    if (threadId) {
      where.threadId = threadId;
    }
    if (checkpointNs !== undefined) {
      where.checkpointNs = checkpointNs;
    }
    if (before?.configurable?.checkpoint_id) {
      where.checkpointId = { lt: before.configurable.checkpoint_id };
    } else if (checkpointId) {
      where.checkpointId = checkpointId;
    }

    const dbCheckpoints = await prisma.checkpoint.findMany({
      where,
      orderBy: {
        checkpointId: "desc",
      },
      take: limit,
    });

    for (const dbCp of dbCheckpoints) {
      const checkpoint = await this.serde.loadsTyped(
        "json",
        JSON.stringify(dbCp.checkpoint)
      ) as Checkpoint;

      const metadata = await this.serde.loadsTyped(
        "json",
        JSON.stringify(dbCp.metadata)
      ) as CheckpointMetadata;

      // Apply filter on metadata fields if supplied
      if (filter && !Object.entries(filter).every(([k, v]) => (metadata as any)[k] === v)) {
        continue;
      }

      const dbWrites = await prisma.checkpointWrite.findMany({
        where: {
          threadId: dbCp.threadId,
          checkpointNs: dbCp.checkpointNs,
          checkpointId: dbCp.checkpointId,
        },
        orderBy: [
          { taskId: "asc" },
          { idx: "asc" },
        ],
      });

      const pendingWrites: CheckpointPendingWrite[] = await Promise.all(
        dbWrites.map(async (w) => {
          const val = await this.serde.loadsTyped(
            "json",
            JSON.stringify(w.value)
          );
          return [w.taskId, w.channel, val] as CheckpointPendingWrite;
        })
      );

      const tuple: CheckpointTuple = {
        config: {
          configurable: {
            thread_id: dbCp.threadId,
            checkpoint_ns: dbCp.checkpointNs,
            checkpoint_id: dbCp.checkpointId,
          },
        },
        checkpoint,
        metadata,
        pendingWrites,
      };

      if (dbCp.parentCheckpointId) {
        tuple.parentConfig = {
          configurable: {
            thread_id: dbCp.threadId,
            checkpoint_ns: dbCp.checkpointNs,
            checkpoint_id: dbCp.parentCheckpointId,
          },
        };
      }

      yield tuple;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    if (!threadId) {
      throw new Error("Missing thread_id in RunnableConfig configurable properties");
    }

    const preparedCheckpoint = copyCheckpoint(checkpoint);
    const [, serializedCheckpoint] = await this.serde.dumpsTyped(preparedCheckpoint);
    const [, serializedMetadata] = await this.serde.dumpsTyped(metadata);

    const checkpointJson = JSON.parse(new TextDecoder().decode(serializedCheckpoint));
    const metadataJson = JSON.parse(new TextDecoder().decode(serializedMetadata));

    const parentCheckpointId = config.configurable?.checkpoint_id;

    await prisma.checkpoint.upsert({
      where: {
        threadId_checkpointNs_checkpointId: {
          threadId,
          checkpointNs,
          checkpointId: checkpoint.id,
        },
      },
      update: {
        checkpoint: checkpointJson,
        metadata: metadataJson,
        parentCheckpointId,
      },
      create: {
        threadId,
        checkpointNs,
        checkpointId: checkpoint.id,
        checkpoint: checkpointJson,
        metadata: metadataJson,
        parentCheckpointId,
      },
    });

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = config.configurable?.checkpoint_id;
    console.log("putWrites", threadId, checkpointNs, checkpointId);
    if (!threadId || !checkpointId) {
      throw new Error("Missing configurable thread_id or checkpoint_id");
    }

    await Promise.all(
      writes.map(async ([channel, value], idx) => {
        const [, serializedValue] = await this.serde.dumpsTyped(value);
        const valJson = JSON.parse(new TextDecoder().decode(serializedValue));

        // Map write index: if channel matches internal symbols
        const finalIdx = WRITES_IDX_MAP[channel] ?? idx;

        await prisma.checkpointWrite.upsert({
          where: {
            threadId_checkpointNs_checkpointId_taskId_idx: {
              threadId,
              checkpointNs,
              checkpointId,
              taskId,
              idx: finalIdx,
            },
          },
          update: {
            channel,
            value: valJson,
          },
          create: {
            threadId,
            checkpointNs,
            checkpointId,
            taskId,
            idx: finalIdx,
            channel,
            value: valJson,
          },
        });
      })
    );
  }

  async deleteThread(threadId: string): Promise<void> {
    await prisma.checkpointWrite.deleteMany({
      where: {
        threadId,
      },
    });
    await prisma.checkpoint.deleteMany({
      where: {
        threadId,
      },
    });
  }
}
