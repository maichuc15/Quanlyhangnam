import * as xb from 'xrblocks';

import {FamilyStore} from '../store/familyStore';
import {SpatialCalendarStage} from './SpatialCalendarStage';
import {SpatialWorkspace} from './SpatialWorkspace';

/**
 * Legacy XR Blocks scene script kept cleanly decoupled from the primary 2D web interface.
 */
export class FamilyEventXRApp extends xb.Script {
  readonly store: FamilyStore;
  readonly stage: SpatialCalendarStage;
  readonly workspace: SpatialWorkspace;

  constructor() {
    super();
    this.name = 'Lịch Gia Đình XR';
    this.store = new FamilyStore();
    this.stage = new SpatialCalendarStage(this.store);
    this.workspace = new SpatialWorkspace(this.store, this.stage);
  }

  init() {
    this.store.setToastHandler((message) => {
      this.workspace.setStatusHint(message);
    });
    this.add(this.stage);
    this.add(this.workspace);
  }
}
