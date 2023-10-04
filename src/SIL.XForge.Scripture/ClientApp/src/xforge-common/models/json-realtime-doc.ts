import { OtJson0Op } from 'ot-json0';
import { Json0OpBuilder } from 'realtime-server/lib/esm/common/utils/json0-op-builder';
import { RealtimeDoc } from './realtime-doc';

/** See https://github.com/ottypes/json0 */
export abstract class JsonRealtimeDoc<T = any> extends RealtimeDoc<T, OtJson0Op[]> {
  /**
   * Build and submit a JSON0 operation. The operation is built using the specified function. The function should use
   * the passed in builder to build the operation. The builder class provides various methods for generating operations
   * that will be submitted to the document.
   *
   * @param {(op: Json0OpBuilder<T>) => void} build The function to build the operation.
   * @param {*} [source] The source. In practice, `true` (the default) specifies that the op should be
   * to considered to have originated locally, rather than `false` to specify remotely.
   */
  async submitJson0Op(build: (op: Json0OpBuilder<T>) => void, source: any = true): Promise<boolean> {
    if (this.data == null) {
      return false;
    }
    const builder = new Json0OpBuilder(this.data);
    build(builder);
    if (builder.op.length > 0) {
      await this.submit(builder.op, source);
      return true;
    }
    return false;
  }
}
